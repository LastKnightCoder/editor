import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MigrationLedger, type MigrationDocument } from "@tau/collaboration";

function setup() {
  const directory = mkdtempSync(join(tmpdir(), "tau-migration-"));
  let db: Database.Database;
  let now = 10;
  const open = () => {
    db = new Database(join(directory, "state.db"));
    db.pragma("journal_mode=WAL");
    db.pragma("synchronous=FULL");
    db.exec("CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY, value TEXT NOT NULL)");
    db.prepare("INSERT OR IGNORE INTO documents VALUES (?,?)").run(
      "doc",
      JSON.stringify({
        id: "doc",
        ownerId: "owner",
        epoch: 1,
        revision: "before",
        version: 1,
        baselineId: "old",
      })
    );
    return new MigrationLedger(
      {
        exec: (sql, ...parameters) => {
          db.prepare(sql).run(...parameters);
        },
        get: <T>(sql: string, ...parameters: (string | number | null)[]) =>
          db.prepare(sql).get(...parameters) as T | undefined,
        transaction: action => db.transaction(action)(),
      },
      id => {
        const row = db.prepare("SELECT value FROM documents WHERE id=?").get(id) as {
          value: string;
        };
        return JSON.parse(row.value) as MigrationDocument;
      },
      () => now
    );
  };
  const ledger = open();
  const install = vi.fn((document: MigrationDocument) => {
    db.prepare("UPDATE documents SET value=? WHERE id=?").run(
      JSON.stringify(document),
      document.id
    );
  });
  return {
    ledger,
    install,
    advance: (value: number) => {
      now = value;
    },
    reopen: () => {
      db.close();
      return open();
    },
    dispose: () => {
      db.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
const request = { id: "operation", actorId: "owner", expectedEpoch: 1, expiresAt: 100 };
const fingerprint = {
  expectedRevision: "before",
  candidateHash: "a".repeat(64),
  targetVersion: 2,
  baselineId: "new",
};

describe("迁移的 SQLite 耐久回执", () => {
  it("提交响应丢失后重启可读取回执，重试不重复安装", () => {
    const { ledger, install, reopen, dispose } = setup();
    try {
      ledger.begin("doc", request);
      ledger.freeze("doc", request.id, "owner");
      const committed = ledger.commit("doc", request.id, "owner", fingerprint, install);
      const restarted = reopen();
      expect(restarted.get("doc", request.id, "owner")).toEqual(committed);
      expect(restarted.commit("doc", request.id, "owner", fingerprint, install)).toEqual(committed);
      expect(install).toHaveBeenCalledTimes(1);
      expect(restarted.state("doc")).toMatchObject({ epoch: 2, baselineId: "new" });
      expect(() =>
        restarted.assertWritable("doc", { epoch: 1, version: 1, baselineId: "old" })
      ).toThrow("旧文档基线");
    } finally {
      dispose();
    }
  });

  it("安装中途失败时正文与回执一起回滚，再次提交可完成", () => {
    const { ledger, install, reopen, dispose } = setup();
    try {
      ledger.begin("doc", request);
      ledger.freeze("doc", request.id, "owner");
      expect(() =>
        ledger.commit("doc", request.id, "owner", fingerprint, document => {
          install(document);
          throw new Error("模拟安装中断");
        })
      ).toThrow("模拟安装中断");
      const restarted = reopen();
      expect(restarted.get("doc", request.id, "owner")?.state).toBe("PENDING");
      expect(restarted.state("doc").epoch).toBe(1);
      expect(restarted.commit("doc", request.id, "owner", fingerprint, install).state).toBe(
        "COMMITTED"
      );
    } finally {
      dispose();
    }
  });

  it.each(["cancel", "expire"])("%s 后重启，无正文变化也拒绝迟到提交", ending => {
    const { ledger, install, advance, reopen, dispose } = setup();
    try {
      ledger.begin("doc", request);
      ledger.freeze("doc", request.id, "owner");
      if (ending === "cancel") ledger.cancel("doc", request);
      else advance(100);
      const restarted = reopen();
      expect(restarted.commit("doc", request.id, "owner", fingerprint, install).state).toBe(
        ending === "cancel" ? "ABORTED" : "EXPIRED"
      );
      expect(install).not.toHaveBeenCalled();
      expect(restarted.assertWritable("doc")).not.toHaveProperty("frozen");
    } finally {
      dispose();
    }
  });

  it("取消先于首次请求落盘，迟到准备不能复活同一操作", () => {
    const { ledger, reopen, dispose } = setup();
    try {
      expect(ledger.get("doc", request.id, "owner")).toBeNull();
      ledger.cancel("doc", request);
      expect(reopen().begin("doc", request).state).toBe("ABORTED");
    } finally {
      dispose();
    }
  });

  it("冻结拦截写入，提交先胜时取消返回已提交回执", () => {
    const { ledger, install, dispose } = setup();
    try {
      ledger.begin("doc", request);
      ledger.freeze("doc", request.id, "owner");
      expect(() => ledger.assertWritable("doc")).toThrow("正在迁移");
      const committed = ledger.commit("doc", request.id, "owner", fingerprint, install);
      expect(ledger.cancel("doc", request)).toEqual(committed);
    } finally {
      dispose();
    }
  });
});
