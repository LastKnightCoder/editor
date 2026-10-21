import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));

import MAIN_SCHEMA_SQL from "../../../../../../packages/db-schema/schema/main.sql?raw";
import PluginRecordTable from "../tables/plugin-records";
import PluginEntityTable from "../tables/plugin-entity";

const scope = { databaseName: ":memory:", pluginId: "tau.questions", collection: "groups" };
const indexes = { sortIndex: "number", isDefault: "boolean" } as const;
const DAY = 24 * 60 * 60 * 1000;
const OLDEST = [{ builtin: "createdAt", direction: "asc" as const }];

describe("PluginRecordTable", () => {
  let db: Database.Database;
  let seq = 0;
  const insert = (data: Record<string, unknown>, extra: Partial<typeof scope> = {}) =>
    PluginRecordTable.insert(db, { ...scope, ...extra, id: `id-${++seq}`, data, indexes });

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(MAIN_SCHEMA_SQL);
  });
  afterEach(() => db.close());

  it("按插件与集合隔离；修改与删除校验 revision", () => {
    const record = insert({ title: "默认", sortIndex: 1, isDefault: true });
    expect(record).toMatchObject({ collection: "groups", data: { title: "默认", sortIndex: 1 } });
    expect(PluginRecordTable.get(db, { ...scope, pluginId: "other", id: record.id })).toBeNull();
    expect(PluginRecordTable.get(db, { ...scope, collection: "events", id: record.id })).toBeNull();
    expect(() => insert({ sortIndex: "1" })).toThrow("number");
    expect(() =>
      PluginRecordTable.insert(db, { ...scope, id: record.id, data: {}, indexes })
    ).toThrow("PLUGIN_CONFLICT:");
    expect(() => PluginRecordTable.insert(db, { ...scope, id: "a b", data: {} })).toThrow("ID");

    const updated = PluginRecordTable.update(db, {
      ...scope,
      id: record.id,
      data: { title: "改名", sortIndex: 2 },
      expectedRevision: record.revision,
      indexes,
    });
    expect(updated.data).toEqual({ title: "改名", sortIndex: 2 });
    expect(updated.revision).not.toBe(record.revision);
    expect(() =>
      PluginRecordTable.remove(db, { ...scope, id: record.id, expectedRevision: record.revision })
    ).toThrow("PLUGIN_CONFLICT:");
    PluginRecordTable.remove(db, { ...scope, id: record.id, expectedRevision: updated.revision });
    expect(PluginRecordTable.get(db, { ...scope, id: record.id })).toBeNull();
    // 不进「最近删除」
    expect(db.prepare("SELECT COUNT(*) AS n FROM plugin_operations").get()).toEqual({ n: 0 });
  });

  it("按索引字段筛选、排序、计数与翻页", () => {
    insert({ sortIndex: 3 });
    insert({ sortIndex: 1, isDefault: true });
    insert({ sortIndex: 2 });
    insert({ sortIndex: 9 }, { collection: "events" });
    const order = [{ field: "sortIndex", type: "number" as const, direction: "asc" as const }];
    const first = PluginRecordTable.query(db, { ...scope, query: { orderBy: order, limit: 2 } });
    const rest = PluginRecordTable.query(db, {
      ...scope,
      query: { orderBy: order, limit: 2, cursor: first.cursor },
    });
    expect([...first.items, ...rest.items].map(item => item.data.sortIndex)).toEqual([1, 2, 3]);
    expect(
      PluginRecordTable.count(db, {
        ...scope,
        where: [{ field: "isDefault", type: "boolean", op: "eq", value: true }],
      })
    ).toBe(1);
    expect(
      PluginRecordTable.query(db, { ...scope, query: { orderBy: OLDEST, limit: 10 } }).items
    ).toHaveLength(3);
  });

  it("插件目录不在时记录与实体一起记孤儿，插件再读写即撤销，超期删除", async () => {
    const record = insert({});
    await PluginEntityTable.create(db, {
      databaseName: ":memory:",
      pluginId: scope.pluginId,
      input: { kind: "question", key: "q", title: "", meta: {} },
    });
    const now = Date.now();
    const orphaned = () =>
      (
        db.prepare("SELECT orphaned_time FROM plugin_records WHERE id = ?").get(record.id) as {
          orphaned_time: number | null;
        }
      ).orphaned_time;
    PluginRecordTable.collectOrphans(db, { installed: new Set(), now, graceMs: 7 * DAY });
    expect(orphaned()).toBe(now);
    // 读写插件实体同样说明插件已重新安装
    PluginEntityTable.query(db, {
      databaseName: ":memory:",
      pluginId: scope.pluginId,
      query: { orderBy: OLDEST, limit: 1 },
    });
    expect(orphaned()).toBeNull();
    PluginRecordTable.collectOrphans(db, { installed: new Set(), now, graceMs: 7 * DAY });
    expect(
      PluginRecordTable.collectOrphans(db, {
        installed: new Set(),
        now: now + 8 * DAY,
        graceMs: 7 * DAY,
      })
    ).toBe(1);
    expect(db.prepare("SELECT COUNT(*) AS n FROM plugin_records").get()).toEqual({ n: 0 });
  });
});
