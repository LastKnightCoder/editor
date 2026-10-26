import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { DocumentProtocolStore, type DocumentProtocol } from "@tau/collaboration";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});
function setup() {
  const directory = mkdtempSync(join(tmpdir(), "tau-protocol-store-"));
  let db: Database.Database;
  const initial: DocumentProtocol = {
    id: "doc",
    ownerId: "owner",
    version: 2,
    epoch: 0,
    baselineId: "current",
    revision: "a".repeat(64),
  };
  const read = vi.fn((id: string) => {
    const row = db.prepare("SELECT value FROM documents WHERE id=?").get(id) as { value: string };
    return JSON.parse(row.value) as DocumentProtocol;
  });
  const open = () => {
    db = new Database(join(directory, "state.db"));
    db.exec("CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY, value TEXT NOT NULL)");
    db.prepare("INSERT OR IGNORE INTO documents VALUES (?,?)").run(
      initial.id,
      JSON.stringify(initial)
    );
    return new DocumentProtocolStore(
      {
        exec: (sql, ...args) => {
          db.prepare(sql).run(...args);
        },
        get: <T>(sql: string, ...args: (string | number | null)[]) =>
          db.prepare(sql).get(...args) as T | undefined,
        transaction: action => db.transaction(action)(),
      },
      read
    );
  };
  const protocols = open();
  cleanups.push(() => {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const install = vi.fn((document = initial) => {
    db.prepare("UPDATE documents SET value=? WHERE id=?").run(
      JSON.stringify(document),
      document.id
    );
  });
  return {
    get db() {
      return db;
    },
    protocols,
    initial,
    read,
    install,
    reopen: () => {
      db.close();
      return open();
    },
  };
}

it("首次发布与回执同事务持久化，重启重试不重复安装", () => {
  const f = setup();
  f.protocols.publish(f.initial, () => f.install());
  const restarted = f.reopen();
  restarted.publish(f.initial, () => f.install());
  expect(f.install).toHaveBeenCalledTimes(1);
  expect(restarted.publication("doc")).toEqual({
    candidateHash: f.initial.revision,
    baselineId: "current",
    version: 2,
  });
  expect(() => restarted.publish({ ...f.initial, baselineId: "other" }, () => f.install())).toThrow(
    "首次发布不能更换"
  );
  expect(
    f.db.prepare("SELECT name FROM sqlite_master WHERE name='collaboration_migrations'").get()
  ).toBeUndefined();
});

it("发布中断回滚正文与协议记录，原候选可以重试", () => {
  const f = setup();
  expect(() =>
    f.protocols.publish(f.initial, () => {
      f.install({ ...f.initial, revision: "b".repeat(64) });
      throw new Error("中断");
    })
  ).toThrow("中断");
  expect(f.protocols.publication("doc")).toBeNull();
  expect(f.read("doc")).toEqual(f.initial);
  f.protocols.publish(f.initial, () => f.install());
  expect(f.protocols.state("doc")).toMatchObject(f.initial);
});

it("修订缓存随真实 SQL 记录核验，事务回滚和重启不能复用陈旧值", () => {
  const f = setup();
  f.protocols.publish(f.initial, () => f.install());
  f.protocols.state("doc");
  f.protocols.state("doc");
  expect(f.read).toHaveBeenCalledTimes(1);
  expect(() =>
    f.db.transaction(() => {
      f.install({ ...f.initial, revision: "b".repeat(64) });
      f.protocols.updateRevision("doc", "b".repeat(64));
      throw new Error("回滚");
    })()
  ).toThrow("回滚");
  expect(f.protocols.state("doc").revision).toBe(f.initial.revision);
  expect(f.read).toHaveBeenCalledTimes(2);
  expect(f.reopen().state("doc").revision).toBe(f.initial.revision);
  expect(f.read).toHaveBeenCalledTimes(3);
  expect(() =>
    f.protocols.assertWritable("doc", { version: 2, epoch: 1, baselineId: "other" })
  ).toThrow("旧文档基线");
});

it.each([false, true])("旧迁移状态 frozen=%s 明确拒绝，原记录不解冻或改写", frozen => {
  const f = setup();
  const value = JSON.stringify({ ...f.initial, migrationId: "pending", frozen });
  f.db.prepare("INSERT INTO collaboration_protocol VALUES (?,?)").run("doc", value);
  expect(() => f.protocols.state("doc")).toThrow("已退役");
  expect(() => f.protocols.assertWritable("doc")).toThrow("已退役");
  expect(f.db.prepare("SELECT value FROM collaboration_protocol").get()).toEqual({ value });
  expect(f.read).not.toHaveBeenCalled();
});
