import { CollaborationLocalStore } from "../local-store";
// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ContentLocalState } from "../content-local-state";
import { ContentRecoveryStore } from "../content-recovery";

const cleanup: (() => void)[] = [];
afterEach(() =>
  cleanup
    .splice(0)
    .reverse()
    .forEach(run => run())
);
function setup() {
  const directory = mkdtempSync(join(tmpdir(), "tau-recovery-"));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  let state = new ContentLocalState(new CollaborationLocalStore(directory).db);
  cleanup.push(() => state.db.close());
  let store = new ContentRecoveryStore(directory, state);
  const source = join(directory, "snapshot.db");
  writeFileSync(source, "数据库快照");
  const input = {
    workspaceId: "local-workspace",
    reason: "library-replacement" as const,
    provenance: { sourceId: "source", baselineId: "old", documentId: "document" },
    files: [{ name: "main.db", path: source }],
    missing: [] as string[],
  };
  return {
    directory,
    source,
    input,
    get store() {
      return store;
    },
    get state() {
      return state;
    },
    reopen: () => {
      state.db.close();
      state = new ContentLocalState(new CollaborationLocalStore(directory).db);
      store = new ContentRecoveryStore(directory, state);
    },
  };
}

describe("正文恢复包保全", () => {
  it("正文迁移的内存快照与资源文件可一起保全、重开和导出", () => {
    const context = setup();
    const bytes = Buffer.from([0, 1, 128, 255]);
    const receipt = context.store.save({
      ...context.input,
      reason: "migration",
      files: [
        { name: "source-projection.json", bytes: Buffer.from('{"content":[]}') },
        { name: "document-before.bin", bytes },
        ...context.input.files,
      ],
    });
    context.reopen();
    expect(context.state.recovery(receipt.id)).toEqual(receipt);
    expect(context.store.verify(receipt).files).toHaveLength(3);
    expect(context.store.readFile(receipt, "document-before.bin")).toEqual(bytes);
    const exported = context.store.export(receipt, context.directory);
    expect(readFileSync(join(exported, "document-before.bin"))).toEqual(bytes);
    expect(readFileSync(join(exported, "main.db"), "utf8")).toBe("数据库快照");
  });

  it("旧缓存登记升级后补齐归属，原恢复包和回执保持不变", () => {
    const context = setup();
    const receipt = context.store.save(context.input);
    const original = readFileSync(receipt.manifestPath);
    context.state.db.exec("ALTER TABLE recoveries DROP COLUMN workspace_id; PRAGMA user_version=2");
    context.reopen();
    expect(context.state.db.pragma("user_version", { simple: true })).toBe(3);
    expect(
      context.state.db.prepare("SELECT workspace_id FROM recoveries WHERE id=?").get(receipt.id)
    ).toEqual({ workspace_id: "local-workspace" });
    expect(context.state.recovery(receipt.id)).toEqual(receipt);
    expect(readFileSync(receipt.manifestPath)).toEqual(original);
    expect(context.store.verify(receipt).files).toHaveLength(1);
  });
  it("导出为独立可校验目录，不覆盖已有导出或改动原包", () => {
    const context = setup();
    const receipt = context.store.save(context.input);
    const exported = context.store.export(receipt, context.directory);
    expect(readFileSync(join(exported, "main.db"), "utf8")).toBe("数据库快照");
    expect(readFileSync(join(exported, "manifest.json"))).toEqual(
      readFileSync(receipt.manifestPath)
    );
    expect(() => context.store.export(receipt, context.directory)).toThrow("已有");
    expect(context.store.verify(receipt).files).toHaveLength(1);
  });
  it("逐文件验证后登记，原目录被替换后恢复包仍独立可读", () => {
    const context = setup();
    const receipt = context.store.save(context.input);
    writeFileSync(context.source, "替换后的主库");
    context.reopen();
    expect(context.state.recovery(receipt.id)).toEqual(receipt);
    expect(context.store.verify(receipt).missing).toEqual([]);
    expect(readFileSync(join(context.store.directory, receipt.id, "main.db"), "utf8")).toBe(
      "数据库快照"
    );
  });

  it.each(["files-written", "package-installed", "registered"] as const)(
    "%s 后断电，重启重新验证并补齐唯一回执",
    phase => {
      const context = setup();
      expect(() =>
        context.store.save(context.input, current => {
          if (current === phase) throw new Error("模拟断电");
        })
      ).toThrow("模拟断电");
      context.reopen();
      context.store.recoverUnregistered();
      const rows = context.state.db.prepare("SELECT id FROM recoveries").all() as { id: string }[];
      expect(rows).toHaveLength(1);
      const receipt = context.state.recovery(rows[0].id)!;
      expect(context.store.verify(receipt).files).toHaveLength(1);
      expect(context.store.recoverUnregistered()).toEqual([]);
    }
  );

  it("资源缺失明确记录，文件损坏和清单篡改不能获得通过校验的回执", () => {
    const context = setup();
    const receipt = context.store.save({
      ...context.input,
      missing: ["entity-body:table-7", "asset:photo"],
    });
    expect(context.store.verify(receipt).missing).toHaveLength(2);
    writeFileSync(join(context.store.directory, receipt.id, "main.db"), "损坏");
    expect(() => context.store.verify(receipt)).toThrow("损坏");
    writeFileSync(receipt.manifestPath, "{}");
    expect(() => context.store.verify(receipt)).toThrow("摘要");
    expect(context.state.recovery(receipt.id)).toEqual(receipt);
  });

  it("不接纳逃逸文件名或符号链接，不删除失败前的原始材料", () => {
    const context = setup();
    expect(() =>
      context.store.save({
        ...context.input,
        files: [{ name: "../outside", path: context.source }],
      })
    ).toThrow("清单");
    const link = join(context.directory, "link");
    symlinkSync(context.source, link);
    expect(() =>
      context.store.save({ ...context.input, files: [{ name: "data", path: link }] })
    ).toThrow("普通文件");
    expect(readFileSync(context.source, "utf8")).toBe("数据库快照");
  });
});
