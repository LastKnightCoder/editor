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

  it("导入保留库里已有的值，整批失败不写入；清除只删该插件", () => {
    PluginKvTable.set(db, { ...scope, key: "synced", value: '"from-cloud"' });
    expect(
      PluginKvTable.importEntries(db, {
        databaseName: ":memory:",
        entries: [
          { pluginId: scope.pluginId, key: "synced", value: '"local"' },
          { pluginId: scope.pluginId, key: "local", value: "1" },
          { pluginId: "other", key: "local", value: "2" },
        ],
      })
    ).toBe(2);
    expect(PluginKvTable.get(db, { ...scope, key: "synced" })).toBe('"from-cloud"');
    expect(PluginKvTable.get(db, { ...scope, key: "local" })).toBe("1");
    expect(() =>
      PluginKvTable.importEntries(db, {
        databaseName: ":memory:",
        entries: [
          { pluginId: scope.pluginId, key: "a", value: "1" },
          { pluginId: "", key: "b", value: "2" },
        ],
      })
    ).toThrow("插件 ID 无效");
    expect(PluginKvTable.get(db, { ...scope, key: "a" })).toBeNull();
    expect(PluginKvTable.clear(db, scope)).toBe(2);
    expect(PluginKvTable.get(db, { ...scope, pluginId: "other", key: "local" })).toBe("2");
  });
});
