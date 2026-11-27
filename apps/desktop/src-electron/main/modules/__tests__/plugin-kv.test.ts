import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import MAIN_SCHEMA_SQL from "../../../../../../packages/db-schema/schema/main.sql?raw";
import PluginKvTable from "../tables/plugin-kv";

const scope = { databaseName: ":memory:", pluginId: "tau.weekly-review" };

describe("PluginKvTable", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(MAIN_SCHEMA_SQL);
  });
  afterEach(() => db.close());

  it("按插件隔离读写与删除", () => {
    PluginKvTable.set(db, { ...scope, key: "theme", value: '"dark"' });
    PluginKvTable.set(db, { ...scope, key: "theme", value: '"light"' });
    expect(PluginKvTable.get(db, { ...scope, key: "theme" })).toBe('"light"');
    expect(PluginKvTable.get(db, { ...scope, pluginId: "other", key: "theme" })).toBeNull();
    PluginKvTable.remove(db, { ...scope, key: "theme" });
    expect(PluginKvTable.get(db, { ...scope, key: "theme" })).toBeNull();
    expect(() => PluginKvTable.get(db, { ...scope, databaseName: "other.db", key: "x" })).toThrow(
      "数据库已切换"
    );
    expect(() =>
      PluginKvTable.set(db, { ...scope, key: "big", value: "x".repeat(1024 * 1024 + 1) })
    ).toThrow("1 MB");
  });

  it("清除只删除当前插件，不影响其他插件", () => {
    PluginKvTable.set(db, { ...scope, key: "synced", value: '"from-cloud"' });
    PluginKvTable.set(db, { ...scope, key: "local", value: "1" });
    PluginKvTable.set(db, { ...scope, pluginId: "other", key: "local", value: "2" });
    expect(PluginKvTable.clear(db, scope)).toBe(2);
    expect(PluginKvTable.get(db, { ...scope, key: "synced" })).toBeNull();
    expect(PluginKvTable.get(db, { ...scope, pluginId: "other", key: "local" })).toBe("2");
  });

  it("summary 汇总当前库各表留存数据，并在 clear 后移除对应插件", () => {
    PluginKvTable.set(db, { ...scope, key: "theme", value: '"paper"' });
    db.prepare(
      `INSERT INTO contents (content, count, create_time, update_time) VALUES ('[]', 0, 100, 100)`
    ).run();
    const contentId = (db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id;
    db.prepare(
      `INSERT INTO plugin_entity_kinds (plugin_id, kind, label, icon, update_time)
       VALUES (?, 'episode', '播客单集', '', 200), (?, 'unused', '未用类型', '', 150)`
    ).run(scope.pluginId, scope.pluginId);
    db.prepare(
      `INSERT INTO plugin_entities (plugin_id, kind, key, title, content_id, meta, create_time, update_time)
       VALUES (?, 'episode', 'ep-1', '第一期', ?, '{}', 100, 300)`
    ).run(scope.pluginId, contentId);
    db.prepare(
      `INSERT INTO plugin_records (id, plugin_id, collection, data, create_time, update_time)
       VALUES ('r1', ?, 'logs', '{}', 100, 250)`
    ).run(scope.pluginId);
    db.prepare(
      `INSERT INTO plugin_ref_grants (plugin_id, kind, ref_id, target_created_at, create_time)
       VALUES ('only.grants', 'card', '1', 10, 400)`
    ).run();

    const list = PluginKvTable.summary(db, { databaseName: scope.databaseName });
    expect(list.map(item => item.pluginId)).toContain(scope.pluginId);
    expect(list.find(item => item.pluginId === scope.pluginId)).toMatchObject({
      pluginId: scope.pluginId,
      entities: 1,
      entityKinds: ["播客单集"],
      records: 1,
      kv: 1,
    });
    expect(list.find(item => item.pluginId === "only.grants")).toMatchObject({
      pluginId: "only.grants",
      entities: 0,
      records: 0,
      kv: 0,
      other: 1,
    });

    PluginKvTable.clear(db, scope);
    expect(
      PluginKvTable.summary(db, { databaseName: scope.databaseName }).map(item => item.pluginId)
    ).toEqual(["only.grants"]);
    expect(() => PluginKvTable.summary(db, { databaseName: "other.db" })).toThrow("数据库已切换");
  });
});
