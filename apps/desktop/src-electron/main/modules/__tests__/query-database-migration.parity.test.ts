import Database from "better-sqlite3";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("electron");
vi.mock("../video-note-index-queue");
import fixtures from "@tau/db-schema/query-database-migration-fixtures.json";
import {
  migrateQueryDefinition,
  migrateQueryView,
  migrateQueryViewType,
} from "@tau/db-schema/src/query-database-migration";
import { ensureMainSchema } from "../main-schema";
import { executeQuery, parseQuery } from "@tau/shared/query-database";
import DataTableQueryTable from "../tables/data-table-query";

const opened: Database.Database[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});
function database() {
  const db = new Database(":memory:");
  opened.push(db);
  ensureMainSchema(db);
  db.exec(
    "CREATE TABLE data_table_sources(table_id INTEGER PRIMARY KEY,kind TEXT,scope TEXT,fields TEXT,create_time INTEGER,update_time INTEGER)"
  );
  return db;
}
function legacy(
  db: Database.Database,
  id: number,
  kind: string,
  scope: unknown,
  fields: unknown,
  columns: unknown = [],
  rows: unknown = []
) {
  db.prepare(
    "INSERT INTO data_tables(id,create_time,update_time,columns,rows,ref_count) VALUES(?,1,2,?,?,1)"
  ).run(id, JSON.stringify(columns), JSON.stringify(rows));
  db.prepare("INSERT INTO data_table_sources VALUES(?,?,?,?,1,2)").run(
    id,
    kind,
    JSON.stringify(scope),
    JSON.stringify(fields)
  );
}
it("两端升级的手写契约一致，视图只映射字段身份而不替换筛选值", () => {
  for (const fixture of fixtures) {
    const migrated = migrateQueryDefinition(fixture.input);
    expect(migrated.definition).toEqual(fixture.definition);
    expect(migrateQueryView(fixture.config, migrated.columnMap, fixture.input.columns)).toEqual(
      fixture.view
    );
    expect(migrateQueryViewType(fixture.type, fixture.view)).toBe(fixture.viewType);
  }
});
it("当前版本重新带回旧来源表时仍原地迁移，重复开库不重复释放正文", async () => {
  const db = database();
  db.exec(
    "INSERT INTO contents(id,create_time,update_time,content,ref_count) VALUES(90,1,1,'[]',1),(91,1,1,'[]',2);INSERT INTO cards(id,create_time,update_time,tags,content_id) VALUES(7,1,1,'[\"读书/摘录\"]',90),(8,1,1,'[\"其他\"]',0)"
  );
  legacy(
    db,
    3,
    "card",
    { tags: ["读书"] },
    ["title", "tags"],
    [
      { id: "src:title", title: "开头" },
      { id: "own", type: "rich-text" },
    ],
    [{ id: "card:7", detailContentId: 91, own: [{ contentId: 91 }] }]
  );
  db.exec(
    "INSERT INTO database_item(id,title,data_table_id,create_time,update_time) VALUES(20,'原表',3,1,2)"
  );
  db.exec(`INSERT INTO data_table_views(id,table_id,name,type,config,sort_order,create_time,update_time)
    VALUES(5,3,'旧日历','calendar','{"viewOptions":{"calendar":{"dateColumnId":"own"}}}',0,1,2);
    UPDATE data_tables SET active_view_id=5 WHERE id=3;`);
  const before = db.prepare("SELECT * FROM cards ORDER BY id").all();
  ensureMainSchema(db);
  const definition = DataTableQueryTable.get(db, 3)?.definition;
  expect(definition).toBeDefined();
  if (!definition) throw new Error("迁移缺少定义");
  const result = await executeQuery(
    parseQuery(definition.code),
    async request => DataTableQueryTable.read(db, request),
    { now: 1, today: "2026-11-26", timeZone: "Asia/Shanghai", params: {} }
  );
  expect(result.rows.map(row => row.id)).toEqual(["card:7"]);
  expect(db.prepare("SELECT columns,rows FROM data_tables WHERE id=3").get()).toEqual({
    columns: "[]",
    rows: "[]",
  });
  expect(db.prepare("SELECT active_view_id FROM data_tables WHERE id=3").get()).toEqual({
    active_view_id: 5,
  });
  expect(db.prepare("SELECT id,type FROM data_table_views WHERE table_id=3").get()).toEqual({
    id: 5,
    type: "table",
  });
  expect(db.prepare("SELECT title,data_table_id FROM database_item WHERE id=20").get()).toEqual({
    title: "原表",
    data_table_id: 3,
  });
  expect(db.prepare("SELECT * FROM cards ORDER BY id").all()).toEqual(before);
  expect(db.prepare("SELECT id,ref_count FROM contents ORDER BY id").all()).toEqual([
    { id: 90, ref_count: 1 },
    { id: 91, ref_count: 0 },
  ]);
  expect(db.prepare("SELECT content_id FROM content_pending_releases").all()).toEqual([
    { content_id: 91 },
  ]);
  const saved = db.prepare("SELECT * FROM data_table_queries").all();
  ensureMainSchema(db);
  expect(db.prepare("SELECT * FROM data_table_queries").all()).toEqual(saved);
  expect(db.prepare("SELECT ref_count FROM contents WHERE id=90").get()).toEqual({ ref_count: 1 });
  expect(
    db.prepare("SELECT name FROM sqlite_master WHERE name='data_table_sources'").get()
  ).toBeUndefined();
});
it("迁移中途失败整体回滚，保留旧来源、自建数据与版本标记", () => {
  const db = database();
  legacy(db, 1, "article", {}, ["title"], [], [{ id: "article:1", own: "保留" }]);
  legacy(db, 2, "document", { projectId: 0 }, ["title"]);
  const meta = db.prepare("SELECT * FROM schema_meta ORDER BY key").all();
  expect(() => ensureMainSchema(db)).toThrow("项目编号");
  expect(db.prepare("SELECT table_id FROM data_table_sources ORDER BY table_id").all()).toEqual([
    { table_id: 1 },
    { table_id: 2 },
  ]);
  expect(db.prepare("SELECT rows FROM data_tables WHERE id=1").get()).toEqual({
    rows: '[{"id":"article:1","own":"保留"}]',
  });
  expect(db.prepare("SELECT * FROM data_table_queries").all()).toEqual([]);
  expect(db.prepare("SELECT * FROM schema_meta ORDER BY key").all()).toEqual(meta);
});
