// @vitest-environment node
import Database from "better-sqlite3";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import version from "@tau/db-schema/schema/main-version.json";
import { ensureMainSchema, removeRetiredDatabaseState } from "../main-schema";

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
  it("启动清理所有本机资料库与旧配对目录，保留普通数据和云端设置", () => {
    const directory = mkdtempSync(join(tmpdir(), "tau-retired-state-"));
    directories.push(directory);
    mkdirSync(join(directory, "device-sync"));
    writeFileSync(join(directory, "device-sync", "host.json"), "旧配置");
    writeFileSync(join(directory, "setting.json"), "云端设置");
    for (const name of ["active.db", "inactive.DB"]) {
      const library = new Database(join(directory, name));
      library.exec(
        "CREATE TABLE notes(content TEXT); INSERT INTO notes VALUES('正文'); CREATE TABLE _tau_device_state(payload TEXT); INSERT INTO _tau_device_state VALUES('旧同步状态')"
      );
      library.close();
    }
    removeRetiredDatabaseState(directory);
    removeRetiredDatabaseState(directory);
    expect(existsSync(join(directory, "device-sync"))).toBe(false);
    expect(readFileSync(join(directory, "setting.json"), "utf8")).toBe("云端设置");
    for (const name of ["active.db", "inactive.DB"]) {
      const library = new Database(join(directory, name));
      try {
        expect(
          library.prepare("SELECT name FROM sqlite_master WHERE name GLOB '_tau_device_*'").all()
        ).toEqual([]);
        expect(library.prepare("SELECT content FROM notes").get()).toEqual({ content: "正文" });
      } finally {
        library.close();
      }
    }
  });

  it("当前版本仍清退同步内部表与触发器，保留业务数据并允许继续写入", () => {
    ensureMainSchema(db);
    db.pragma("secure_delete = OFF");
    db.exec(`
      INSERT INTO contents(id,create_time,update_time,content,count) VALUES(1,1,1,'[]',0);
      CREATE TABLE _tau_device_log(id INTEGER PRIMARY KEY, payload TEXT);
      INSERT INTO _tau_device_log VALUES(1,'旧同步日志');
      CREATE TABLE "_tau_device_quarantine_a""b"(payload TEXT);
      CREATE INDEX _tau_device_log_index ON _tau_device_log(payload);
      CREATE TRIGGER _tau_device_capture_contents_UPDATE AFTER UPDATE ON contents
      BEGIN INSERT INTO _tau_device_log(payload) VALUES(NEW.content); END;
      CREATE TABLE _tau_devices_keep(id INTEGER);
    `);
    ensureMainSchema(db);
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name GLOB '_tau_device_*'").all()
    ).toEqual([]);
    expect(db.pragma("secure_delete", { simple: true })).toBe(0);
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name='_tau_devices_keep'").get()
    ).toBeTruthy();
    db.prepare("UPDATE contents SET count=1 WHERE id=1").run();
    expect(db.prepare("SELECT count FROM contents WHERE id=1").get()).toEqual({ count: 1 });
    expect(db.pragma("foreign_key_check")).toEqual([]);
    const before = schema();
    ensureMainSchema(db);
    expect(schema()).toEqual(before);
  });

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

  it.each([undefined, "4", "5", "6", "7", "8", "9", "999"])(
    "版本标记 %s 不阻止开库，业务记录与额外字段保持原样",
    oldVersion => {
      ensureMainSchema(db);
      db.exec(
        "ALTER TABLE cards ADD COLUMN links TEXT; CREATE TABLE questions(id INTEGER PRIMARY KEY, content TEXT); INSERT INTO questions VALUES (1, '保留原数据')"
      );
      if (oldVersion === undefined) db.exec("DROP TABLE schema_meta");
      else
        db.prepare("UPDATE schema_meta SET value = ? WHERE key = 'main_schema_version'").run(
          oldVersion
        );
      ensureMainSchema(db);
      expect(db.prepare("SELECT content FROM questions").get()).toEqual({ content: "保留原数据" });
      expect(
        db.prepare("SELECT name FROM pragma_table_info('cards') WHERE name = 'links'").get()
      ).toEqual({ name: "links" });
      expect(
        db.prepare("SELECT value FROM schema_meta WHERE key = 'main_schema_version'").get()
      ).toEqual({ value: String(version) });
      const changes = db.prepare("SELECT total_changes() AS count").get();
      ensureMainSchema(db);
      expect(db.prepare("SELECT total_changes() AS count").get()).toEqual(changes);
    }
  );

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
