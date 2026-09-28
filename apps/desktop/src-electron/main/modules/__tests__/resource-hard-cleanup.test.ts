import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import MAIN_SCHEMA_SQL from "@tau/db-schema/schema/main.sql?raw";
import ResourceHardCleanupTable from "../tables/resource-hard-cleanup";

const legacySchema = `
  CREATE TABLE resources (id INTEGER PRIMARY KEY, path TEXT, type TEXT, name TEXT);
  CREATE TABLE resource_group (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES resource_group(id) ON DELETE CASCADE, order_index INTEGER);
  CREATE TABLE resource_scan_version (id INTEGER PRIMARY KEY, version INTEGER);
  CREATE INDEX idx_resource_group_parent_id ON resource_group(parent_id);
  CREATE INDEX idx_resource_group_order_index ON resource_group(order_index);
  CREATE INDEX idx_resources_path ON resources(path);
  CREATE INDEX idx_resources_type ON resources(type);
  CREATE INDEX idx_resources_name ON resources(name);
  CREATE UNIQUE INDEX idx_resources_path_unique ON resources(path);
`;
const databases: Database.Database[] = [];
const open = () => {
  const db = new Database(":memory:");
  databases.push(db);
  return db;
};
const retiredTables = (db: Database.Database) =>
  db
    .prepare(
      "SELECT name FROM sqlite_master WHERE name IN ('resources', 'resource_group', 'resource_scan_version')"
    )
    .all();

afterEach(() => databases.splice(0).forEach(db => db.close()));

describe("资源索引退役迁移", () => {
  it("新库和部分旧表缺失的库可重复迁移", () => {
    const fresh = open();
    fresh.exec(MAIN_SCHEMA_SQL);
    ResourceHardCleanupTable.upgradeTable(fresh);
    ResourceHardCleanupTable.upgradeTable(fresh);
    expect(retiredTables(fresh)).toEqual([]);
    const partial = open();
    partial.exec("CREATE TABLE resource_scan_version(id INTEGER PRIMARY KEY)");
    ResourceHardCleanupTable.upgradeTable(partial);
    ResourceHardCleanupTable.upgradeTable(partial);
    expect(retiredTables(partial)).toEqual([]);
  });

  it("删除三表六索引，只移除资源操作记录，保留业务数据、文件和协作缓存", () => {
    const db = open();
    db.exec(MAIN_SCHEMA_SQL);
    db.exec(legacySchema);
    db.pragma("foreign_keys = ON");
    db.exec("INSERT INTO resource_group VALUES(1, NULL, 0), (2, 1, 0)");
    const retained = [
      "contents",
      "chat_session",
      "resource_sync_blacklist",
      "vibe_learning_resources",
    ];
    const before = retained.map(name =>
      db.prepare(`SELECT sql FROM sqlite_master WHERE name = ?`).get(name)
    );
    db.exec(`INSERT INTO contents(id, create_time, update_time, content, count, ref_count)
      VALUES(1, 1, 1, '[{"type":"image","url":"/saved.png"}]', 0, 1);
      INSERT INTO chat_session(id, scope, session_file, title, create_time, update_time)
      VALUES('s1', 'main-chat', 's1.jsonl', '/saved.png', 1, 1);
      INSERT INTO resource_sync_blacklist(file_name, create_time, update_time) VALUES('saved.png', 1, 1);
      INSERT INTO operation(operation_content_type, operation_action, operation_id, operation_time)
      VALUES('resource', 'insert', 42, 1), ('content', 'insert', 1, 1);`);
    const rows = retained.map(name => db.prepare(`SELECT * FROM ${name}`).all());
    const collaboration = open();
    collaboration.exec(
      "CREATE TABLE resources(id TEXT, path TEXT); INSERT INTO resources VALUES('asset', '/saved.png')"
    );
    const directory = mkdtempSync(join(tmpdir(), "tau-resource-cleanup-"));
    try {
      const file = join(directory, "saved.png");
      writeFileSync(file, "附件内容");
      db.prepare("INSERT INTO resources VALUES(42, ?, 'image', 'saved.png')").run(file);
      ResourceHardCleanupTable.upgradeTable(db);
      ResourceHardCleanupTable.upgradeTable(db);
      expect(retiredTables(db)).toEqual([]);
      expect(
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='index' AND (name LIKE 'idx_resources_%' OR name LIKE 'idx_resource_group_%')"
          )
          .all()
      ).toEqual([]);
      expect(db.prepare("SELECT operation_content_type FROM operation").all()).toEqual([
        { operation_content_type: "content" },
      ]);
      expect(
        retained.map(name => db.prepare("SELECT sql FROM sqlite_master WHERE name = ?").get(name))
      ).toEqual(before);
      expect(retained.map(name => db.prepare(`SELECT * FROM ${name}`).all())).toEqual(rows);
      expect(collaboration.prepare("SELECT * FROM resources").all()).toEqual([
        { id: "asset", path: "/saved.png" },
      ]);
      expect(readFileSync(file, "utf8")).toBe("附件内容");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("中途失败回滚已删除的表和操作记录，并向调用方报告", () => {
    const db = open();
    db.exec(`CREATE TABLE operation(operation_content_type TEXT);
      INSERT INTO operation VALUES('resource');
      CREATE TABLE resources(id INTEGER); INSERT INTO resources VALUES(42);
      CREATE VIEW resource_scan_version AS SELECT 1 AS id;
      CREATE TABLE resource_group(id INTEGER);`);
    expect(() => ResourceHardCleanupTable.upgradeTable(db)).toThrow();
    expect(db.prepare("SELECT * FROM resources").all()).toEqual([{ id: 42 }]);
    expect(db.prepare("SELECT * FROM operation").all()).toEqual([
      { operation_content_type: "resource" },
    ]);
    expect(retiredTables(db)).toHaveLength(3);
  });
});
