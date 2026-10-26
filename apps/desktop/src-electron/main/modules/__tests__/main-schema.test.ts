// @vitest-environment node
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import version from "@tau/db-schema/schema/main-version.json";
import { ensureMainSchema } from "../main-schema";

let db: Database.Database;
const directories: string[] = [];
beforeEach(() => {
  db = new Database(":memory:");
});
afterEach(() => {
  db.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
const schema = () => db.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY name").all();

describe("主库当前基线", () => {
  it("文件数据库启用 WAL 与外键，重开继续使用同一基线", () => {
    const directory = mkdtempSync(join(tmpdir(), "tau-schema-"));
    directories.push(directory);
    const filename = join(directory, "test.db");
    db.close();
    db = new Database(filename);
    ensureMainSchema(db);
    expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    db.close();
    db = new Database(filename);
    ensureMainSchema(db);
    expect(
      db.prepare("SELECT value FROM schema_meta WHERE key = 'main_schema_version'").get()
    ).toEqual({ value: String(version) });
  });
  it("新库一次建成当前结构、提供方与版本，重复打开不写入", () => {
    ensureMainSchema(db);
    expect(
      db.prepare("SELECT value FROM schema_meta WHERE key = 'main_schema_version'").get()
    ).toEqual({ value: String(version) });
    expect(
      db.prepare("SELECT label FROM excerpt_provider WHERE source_type = 'web'").get()
    ).toEqual({ label: "网页" });
    expect(
      db.prepare("SELECT name FROM pragma_table_info('cards') WHERE name = 'links'").all()
    ).toEqual([]);
    expect(
      db
        .prepare("SELECT name FROM pragma_table_info('flashcards') WHERE name = 'memory_stability'")
        .get()
    ).toEqual({ name: "memory_stability" });
    const changes = db.prepare("SELECT total_changes() AS count").get();
    ensureMainSchema(db);
    expect(db.prepare("SELECT total_changes() AS count").get()).toEqual(changes);
  });

  it("无版本的旧库拒绝打开，不创建元数据或转换内容", () => {
    db.exec(
      "CREATE TABLE cards(id INTEGER PRIMARY KEY, links TEXT); INSERT INTO cards VALUES (1, '[2]')"
    );
    const before = schema();
    expect(() => ensureMainSchema(db)).toThrow("DB_SCHEMA_INCOMPATIBLE");
    expect(schema()).toEqual(before);
    expect(db.prepare("SELECT * FROM cards").all()).toEqual([{ id: 1, links: "[2]" }]);
  });

  it.each([4, 5, 6, 7, 8, 9, 999])("拒绝版本 %s，保留原问题表与版本", oldVersion => {
    db.exec(
      "CREATE TABLE schema_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL); CREATE TABLE questions(id INTEGER PRIMARY KEY, content TEXT); INSERT INTO questions VALUES (1, '保留原数据')"
    );
    db.prepare("INSERT INTO schema_meta VALUES ('main_schema_version', ?, 0)").run(
      String(oldVersion)
    );
    const before = schema();
    expect(() => ensureMainSchema(db)).toThrow("DB_SCHEMA_INCOMPATIBLE");
    expect(schema()).toEqual(before);
    expect(db.prepare("SELECT content FROM questions").get()).toEqual({ content: "保留原数据" });
    expect(db.prepare("SELECT value FROM schema_meta").get()).toEqual({
      value: String(oldVersion),
    });
  });

  it("同版本补齐缺失索引，不改写已有数据和提供方名称", () => {
    ensureMainSchema(db);
    db.exec(
      "INSERT INTO migration_meta VALUES ('project:id-seq', '77'); UPDATE excerpt_provider SET label = '我的网页' WHERE source_type = 'web'; DROP INDEX idx_contents_update_time; UPDATE schema_meta SET value = 'stale' WHERE key = 'main_schema_hash'"
    );
    ensureMainSchema(db);
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name = 'idx_contents_update_time'").get()
    ).toBeTruthy();
    expect(
      db.prepare("SELECT value FROM migration_meta WHERE key = 'project:id-seq'").get()
    ).toEqual({ value: "77" });
    expect(
      db.prepare("SELECT label FROM excerpt_provider WHERE source_type = 'web'").get()
    ).toEqual({ label: "我的网页" });
  });

  it("初始化失败时结构与版本标记一并回滚", () => {
    db.exec("CREATE VIEW contents AS SELECT 1 AS id");
    const before = schema();
    expect(() => ensureMainSchema(db)).toThrow();
    expect(schema()).toEqual(before);
  });
});
