import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import MAIN_SCHEMA_SQL from "../../../../../../packages/db-schema/schema/main.sql?raw";
import PluginEntityTable from "../tables/plugin-entity";
import PluginLinkTable from "../tables/plugin-links";
import PluginRecordTable from "../tables/plugin-records";
import PluginTransactionTable from "../tables/plugin-transaction";

const scope = { databaseName: ":memory:", pluginId: "tau.questions" };
const input = (key: string) => ({ kind: "question", key, title: key, meta: {} });
const count = (db: Database.Database, table: string) =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

describe("PluginTransactionTable", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(MAIN_SCHEMA_SQL);
  });
  afterEach(() => db.close());

  it("新建、关联、写记录一起生效；同一事务里能用预留的 ID", async () => {
    const id = PluginEntityTable.reserveId(db, scope);
    const answer = PluginEntityTable.reserveId(db, scope);
    await PluginTransactionTable.commit(db, {
      ...scope,
      ops: [
        { op: "entity.create", id, input: { ...input("q"), content: { markdown: "背景" } } },
        { op: "entity.create", id: answer, input: input("a") },
        {
          op: "link.add",
          id: "l1",
          from: id,
          to: { kind: "plugin-entity", id: String(answer) },
          role: "answer",
          data: {},
          readable: false,
        },
        {
          op: "record.insert",
          collection: "events",
          id: "e1",
          data: { questionId: String(id) },
          indexes: {},
        },
      ],
    });
    expect(PluginEntityTable.get(db, { ...scope, id })?.title).toBe("q");
    expect(PluginLinkTable.list(db, { ...scope, from: id })).toHaveLength(1);
    expect(count(db, "plugin_records")).toBe(1);
    // 预留已消费，不能再用
    await expect(
      PluginTransactionTable.commit(db, {
        ...scope,
        ops: [{ op: "entity.create", id, input: input("again") }],
      })
    ).rejects.toThrow("未预留");
  });

  it("任何一条失败全部回滚；不带 revision 即无条件写入", async () => {
    const first = await PluginEntityTable.create(db, { ...scope, input: input("q1") });
    const id = PluginEntityTable.reserveId(db, scope);
    await expect(
      PluginTransactionTable.commit(db, {
        ...scope,
        ops: [
          { op: "entity.create", id, input: input("q2") },
          { op: "entity.update", id: first.id, patch: { title: "改" }, indexes: {} },
          {
            op: "entity.update",
            id: first.id,
            patch: { title: "再改" },
            expectedRevision: "0",
            indexes: {},
          },
        ],
      })
    ).rejects.toThrow("PLUGIN_CONFLICT:");
    expect(PluginEntityTable.get(db, { ...scope, id })).toBeNull();
    expect(PluginEntityTable.get(db, { ...scope, id: first.id })?.title).toBe("q1");
    // 不带 revision 的修改与删除直接生效，删除仍进「最近删除」
    await PluginTransactionTable.commit(db, {
      ...scope,
      ops: [
        { op: "entity.update", id: first.id, patch: { title: "改" }, indexes: {} },
        { op: "entity.delete", id: first.id },
      ],
    });
    expect(PluginEntityTable.get(db, { ...scope, id: first.id })).toBeNull();
    expect(count(db, "plugin_operations")).toBe(1);
  });

  it("只能用预留给本插件的 ID，不能操作其他插件的数据", async () => {
    const id = PluginEntityTable.reserveId(db, { ...scope, pluginId: "other" });
    await expect(
      PluginTransactionTable.commit(db, {
        ...scope,
        ops: [{ op: "entity.create", id, input: input("q") }],
      })
    ).rejects.toThrow("未预留");
    PluginRecordTable.insert(db, {
      ...scope,
      pluginId: "other",
      collection: "groups",
      id: "r1",
      data: {},
    });
    await expect(
      PluginTransactionTable.commit(db, {
        ...scope,
        ops: [{ op: "record.delete", collection: "groups", id: "r1" }],
      })
    ).rejects.toThrow("记录不存在");
    expect(count(db, "plugin_records")).toBe(1);
  });
});
