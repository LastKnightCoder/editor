import DataChangesTable from "../tables/data-changes";
// @vitest-environment node
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import version from "@tau/db-schema/schema/main-version.json";
import { ensureMainSchema } from "../main-schema";
import currentSchema from "@tau/db-schema/schema/main.sql?raw";
import { getNextModuleEntityId, getNextTaskEntityId } from "../tables/module-entity-id";

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
  it("正文任务可靠身份目录丢失后重新准备并切换代次，正文和原始身份保留", () => {
    ensureMainSchema(db);
    const content = JSON.stringify([
      {
        type: "check-list-item",
        taskId: "task",
        children: [{ type: "paragraph", children: [{ text: "正文" }] }],
      },
    ]);
    db.prepare(
      "INSERT INTO contents(id,create_time,update_time,content,ref_count) VALUES(1,10,10,?,1)"
    ).run(content);
    db.prepare(
      "INSERT INTO articles(title,content_id,create_time,update_time) VALUES('原文',1,10,10)"
    ).run();
    const request = {
      phase: "snapshot" as const,
      domains: ["todo" as const],
      todoSource: "document" as const,
      afterDomain: "",
      afterKey: 0,
      afterSeq: 0,
      limit: 10,
    };
    const before = DataChangesTable.read(db, request, "local");
    db.exec("DROP TABLE document_task_identities");
    ensureMainSchema(db);
    const after = DataChangesTable.read(db, request, "local");
    expect(after.scope).not.toBe(before.scope);
    expect(after.items.map(item => item.id)).toEqual(["document:1:10:task"]);
    expect(db.prepare("SELECT content FROM contents WHERE id=1").get()).toEqual({ content });
  });

  it("旧库升级保留正文、额外列、外键、索引、视图与触发器，并恢复历史编号上限", () => {
    db.exec(currentSchema.replaceAll(" AUTOINCREMENT", ""));
    db.exec(`
      ALTER TABLE cards ADD COLUMN extra TEXT;
      INSERT INTO contents(id,create_time,update_time,content) VALUES(10,1,1,'原正文');
      INSERT INTO cards(id,create_time,update_time,content_id,extra) VALUES(7,1,1,10,'额外字段');
      INSERT INTO entity_identities(entity_kind,entity_id,local_id,created_at) VALUES('card','original',7,1);
      CREATE TABLE migration_child(id INTEGER PRIMARY KEY,content_id INTEGER REFERENCES contents(id) ON DELETE CASCADE);
      INSERT INTO migration_child VALUES(1,10);
      CREATE INDEX idx_cards_extra ON cards(extra);
      CREATE VIEW migration_view AS SELECT content FROM contents;
      CREATE TRIGGER migration_update AFTER UPDATE ON contents BEGIN UPDATE cards SET extra='已触发' WHERE id=7; END;
      INSERT INTO operation(operation_time,operation_id,operation_content_type,operation_action) VALUES(1,800,'card','delete');
      INSERT INTO entity_lineage(src_kind,src_id,dst_kind,dst_id,relation,create_time) VALUES('card','810','article','7','derived',1);
      INSERT INTO migration_meta VALUES('task:id-seq:contents','900');
      INSERT INTO schema_meta VALUES('main_schema_version','13',1);
    `);
    ensureMainSchema(db);
    expect(db.prepare("SELECT content FROM migration_view").get()).toEqual({ content: "原正文" });
    expect(db.prepare("SELECT extra,content_id FROM cards WHERE id=7").get()).toEqual({
      extra: "额外字段",
      content_id: 10,
    });
    expect(db.prepare("SELECT * FROM migration_child").all()).toEqual([{ id: 1, content_id: 10 }]);
    expect(
      db.prepare("SELECT retired_at FROM entity_identities WHERE entity_id='original'").get()
    ).toEqual({ retired_at: null });
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name='idx_cards_extra'").get()
    ).toBeTruthy();
    expect(
      db.prepare("INSERT INTO cards(create_time,update_time) VALUES(2,2)").run().lastInsertRowid
    ).toBe(811);
    expect(
      db.prepare("INSERT INTO contents(create_time,update_time) VALUES(2,2)").run().lastInsertRowid
    ).toBe(901);
    db.exec("UPDATE contents SET count=1 WHERE id=10");
    expect(db.prepare("SELECT extra FROM cards WHERE id=7").get()).toEqual({ extra: "已触发" });
    expect(db.pragma("foreign_key_check")).toEqual([]);
    const changes = db.prepare("SELECT total_changes() AS count").get();
    ensureMainSchema(db);
    expect(db.prepare("SELECT total_changes() AS count").get()).toEqual(changes);
  });

  it.each([
    ["cards", "create_time,update_time", "1,1"],
    ["articles", "title,create_time,update_time", "'文章',1,1"],
    ["project_item", "title,create_time,update_time", "'文档',1,1"],
    ["contents", "create_time,update_time", "1,1"],
  ])("%s 删除最大编号并重开后不复用，回滚不消耗编号", (table, columns, values) => {
    const directory = mkdtempSync(join(tmpdir(), "tau-row-id-"));
    directories.push(directory);
    const filename = join(directory, "test.db");
    db.close();
    db = new Database(filename);
    ensureMainSchema(db);
    const insert = db.prepare(`INSERT INTO ${table}(${columns}) VALUES(${values})`);
    const first = Number(insert.run().lastInsertRowid);
    db.prepare(`DELETE FROM ${table} WHERE id=?`).run(first);
    db.exec("BEGIN");
    const rolledBack = Number(insert.run().lastInsertRowid);
    db.exec("ROLLBACK");
    db.close();
    db = new Database(filename);
    ensureMainSchema(db);
    const next = Number(
      db.prepare(`INSERT INTO ${table}(${columns}) VALUES(${values})`).run().lastInsertRowid
    );
    expect(next).toBeGreaterThan(first);
    expect(next).toBe(rolledBack);
  });

  it("手工分配入口遵守数据库序列，保留跨模块共享编号规则", () => {
    ensureMainSchema(db);
    db.exec(`
      INSERT INTO contents(id,create_time,update_time) VALUES(30,1,1); DELETE FROM contents WHERE id=30;
      INSERT INTO database_item(id,create_time,update_time,title) VALUES(50,1,1,'数据库'); DELETE FROM database_item WHERE id=50;
    `);
    expect(getNextTaskEntityId(db, "contents")).toBe(31);
    expect(getNextModuleEntityId(db)).toBe(51);
  });

  it("编号升级失败时旧表、数据及版本回滚，并恢复外键开关", () => {
    db.exec(currentSchema.replaceAll(" AUTOINCREMENT", ""));
    db.exec(`
      INSERT INTO contents(id,create_time,update_time,content) VALUES(10,1,1,'保留正文');
      INSERT INTO schema_meta VALUES('main_schema_version','13',1);
      CREATE TRIGGER migration_reject BEFORE INSERT ON schema_meta BEGIN SELECT RAISE(ABORT,'拒绝提交'); END;
    `);
    const before = schema();
    expect(() => ensureMainSchema(db)).toThrow("拒绝提交");
    expect(schema()).toEqual(before);
    expect(db.prepare("SELECT content FROM contents WHERE id=10").get()).toEqual({
      content: "保留正文",
    });
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(
      db.prepare("SELECT value FROM schema_meta WHERE key='main_schema_version'").get()
    ).toEqual({ value: "13" });
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

  // 已有工作区升级不能弹出首次启动选用途，否则老用户会被要求重新挑功能
  it("只有空库标记等待选用途，已有库升级补表后不标记", () => {
    ensureMainSchema(db);
    const onboarding = () =>
      db.prepare("SELECT value FROM workspace_preferences WHERE key = 'features.onboarding'").get();
    expect(onboarding()).toEqual({ value: "pending" });

    db.exec("DROP TABLE workspace_preferences");
    db.prepare("UPDATE schema_meta SET value = 'stale' WHERE key = 'main_schema_hash'").run();
    ensureMainSchema(db);
    expect(onboarding()).toBeUndefined();
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

const oldReceiptsSql = `CREATE TABLE plugin_create_receipts (
 plugin_id TEXT NOT NULL,request_id TEXT NOT NULL,input_hash TEXT NOT NULL,
 entity TEXT NOT NULL CHECK(entity IN ('todo','event')),entity_id INTEGER NOT NULL,created_at INTEGER NOT NULL,
 operation_id TEXT NOT NULL,retired INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(plugin_id,request_id)
) WITHOUT ROWID;
INSERT INTO plugin_create_receipts VALUES('p','a','h','todo',7,1,'op-a',0),('p','b','h','event',8,2,'op-b',1);`;
it("旧创建回执约束升级保留全部回执及退役状态，目录删除可永久退役请求", () => {
  db.exec(oldReceiptsSql);
  const before = db.prepare("SELECT * FROM plugin_create_receipts ORDER BY request_id").all();
  ensureMainSchema(db);
  expect(db.prepare("SELECT * FROM plugin_create_receipts ORDER BY request_id").all()).toEqual(
    before
  );
  db.exec(
    "INSERT INTO todo_group(id,title,create_time,update_time) VALUES(7,'目录',1,1);INSERT INTO plugin_create_receipts VALUES('p','c','h','todo-list',7,1,'op-c',0);DELETE FROM todo_group WHERE id=7"
  );
  expect(
    db.prepare("SELECT retired FROM plugin_create_receipts WHERE request_id='c'").get()
  ).toEqual({ retired: 1 });
  ensureMainSchema(db);
  expect(
    db
      .prepare(
        "SELECT * FROM plugin_create_receipts WHERE request_id IN ('a','b') ORDER BY request_id"
      )
      .all()
  ).toEqual(before);
});
it("回执升级后续初始化失败会恢复原约束与原数据", () => {
  db.exec(oldReceiptsSql);
  db.exec(
    "CREATE TABLE data_change_log(seq INTEGER PRIMARY KEY AUTOINCREMENT,domain TEXT NOT NULL,entity_id TEXT NOT NULL,operation TEXT NOT NULL);INSERT INTO data_change_log VALUES(900,'calendar','9','upsert')"
  );
  const before = db.prepare("SELECT * FROM plugin_create_receipts ORDER BY request_id").all();
  db.exec(
    "CREATE TABLE schema_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL CHECK(key<>'main_schema_version' OR value='14'),updated_at INTEGER)"
  );
  expect(() => ensureMainSchema(db)).toThrow();
  expect(db.prepare("SELECT * FROM plugin_create_receipts ORDER BY request_id").all()).toEqual(
    before
  );
  expect(() =>
    db.exec("INSERT INTO plugin_create_receipts VALUES('p','c','h','calendar',1,1,'op',0)")
  ).toThrow(/CHECK/);
  expect(
    db.prepare("SELECT name FROM sqlite_master WHERE name='plugin_create_receipts_upgrade'").all()
  ).toEqual([]);
  expect(db.prepare("SELECT * FROM data_change_log").get()).toEqual({
    seq: 900,
    domain: "calendar",
    entity_id: "9",
    operation: "upsert",
  });
  expect(
    (db.pragma("table_info(data_change_log)") as { name: string }[]).some(
      column => column.name === "action"
    )
  ).toBe(false);
});

it("对象事件升级保留旧日志和自增序号，历史动作保持未知且新写入正确分类", () => {
  db.exec(
    "CREATE TABLE data_change_log(seq INTEGER PRIMARY KEY AUTOINCREMENT,domain TEXT NOT NULL,entity_id TEXT NOT NULL,operation TEXT NOT NULL CHECK(operation IN ('upsert','delete')));INSERT INTO data_change_log(seq,domain,entity_id,operation) VALUES(900,'calendar','9','upsert');"
  );
  ensureMainSchema(db);
  expect(db.prepare("SELECT * FROM data_change_log").get()).toEqual({
    seq: 900,
    domain: "calendar",
    entity_id: "9",
    operation: "upsert",
    action: null,
  });
  db.exec(
    "INSERT INTO calendar(id,title,color,create_time,update_time) VALUES(1,'新日历','blue',1,1)"
  );
  expect(db.prepare("SELECT seq,action FROM data_change_log WHERE entity_id='1'").get()).toEqual({
    seq: 901,
    action: "created",
  });
  ensureMainSchema(db);
  expect(db.prepare("SELECT COUNT(*) AS n FROM data_change_log").get()).toEqual({ n: 2 });
});

it("升级替换既有捕获触发器，不把新建误报成修改", () => {
  db.exec(currentSchema);
  db.exec(
    "DROP TRIGGER dc_calendar_insert;CREATE TRIGGER dc_calendar_insert AFTER INSERT ON calendar BEGIN INSERT INTO data_change_log(domain,entity_id,operation) VALUES('calendar',CAST(NEW.id AS TEXT),'upsert'); END;"
  );
  ensureMainSchema(db);
  db.exec(
    "INSERT INTO calendar(id,title,color,create_time,update_time) VALUES(1,'新日历','blue',1,1)"
  );
  expect(
    db.prepare("SELECT action FROM data_change_log WHERE domain='calendar' AND entity_id='1'").get()
  ).toEqual({ action: "created" });
});
