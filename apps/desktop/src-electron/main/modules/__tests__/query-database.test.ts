import Database from "better-sqlite3";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import mainSql from "@tau/db-schema/schema/main.sql?raw";
vi.mock("electron");
vi.mock("../video-note-index-queue");
import DataTableTable from "../tables/data-table";
import DataTableQueryTable from "../tables/data-table-query";
import DataTableViewTable from "../tables/data-table-view";
import { executeQuery, parseQuery } from "@tau/shared/query-database";

let db: Database.Database;
beforeEach(() => {
  db = new Database(":memory:");
  db.exec(mainSql);
});
afterEach(() => db.close());

it("查询定义按版本更新，过期修改不覆盖其他窗口的代码", () => {
  const table = DataTableTable.create(db, { columns: [], rows: [] });
  DataTableQueryTable.attach(db, table.id, {
    version: 1,
    language: "dsl",
    code: "TABLE title FROM cards",
  });
  const definition = { version: 1, language: "dsl", code: "TABLE title FROM articles" } as const;
  const saved = DataTableQueryTable.update(db, {
    tableId: table.id,
    definition,
    expectedRevision: 1,
  });
  expect(saved?.definition).toEqual(definition);
  expect(
    db.prepare("SELECT operation_id,operation_action FROM operation ORDER BY id DESC LIMIT 1").get()
  ).toEqual({ operation_id: table.id, operation_action: "update" });
  expect(() =>
    DataTableQueryTable.update(db, {
      tableId: table.id,
      definition: { ...definition, code: "TABLE title FROM projects" },
      expectedRevision: 1,
    })
  ).toThrow("已被修改");
  expect(DataTableQueryTable.get(db, table.id)?.definition).toEqual(definition);
});

it("查询表拒绝数据写入，同时允许保存视图配置且不持久化计算结果", () => {
  const table = DataTableTable.create(db, { columns: [], rows: [] });
  DataTableQueryTable.attach(db, table.id, {
    version: 1,
    language: "dsl",
    code: "TABLE title FROM cards",
  });
  expect(() => DataTableTable.update(db, { id: table.id, rows: [{ id: "injected" }] })).toThrow(
    "只读"
  );
  expect(() =>
    DataTableTable.applyChanges(db, {
      id: table.id,
      rows: { upsert: [{ id: "injected" }], inserted: ["injected"], remove: [] },
    })
  ).toThrow("只读");
  expect(() =>
    DataTableTable.patchRow(db, {
      tableId: table.id,
      rowId: "injected",
      patch: { title: "写入" },
      expected: {},
    })
  ).toThrow("只读");
  const view = DataTableViewTable.listByTableId(db, table.id)[0];
  DataTableViewTable.update(db, {
    ...view,
    config: { ...view.config, columnWidths: { "q:title": 350 }, hiddenColumnIds: ["q:source"] },
  });
  expect(DataTableViewTable.getById(db, view.id)?.config.columnWidths).toEqual({ "q:title": 350 });
  expect(DataTableViewTable.getById(db, view.id)?.config.hiddenColumnIds).toEqual(["q:source"]);
  const detail = DataTableTable.getDetail(db, table.id);
  expect(detail.table?.query?.definition.code).toBe("TABLE title FROM cards");
  expect(detail.table?.rows).toEqual([]);
});

it("项目范围区分根文档和子文档，循环目录不会重复，范围参数可叠加标签与时间", async () => {
  db.exec(`INSERT INTO project(id,create_time,update_time,title,children) VALUES(1,1,1,'项目','[11,20]');
    INSERT INTO project_item(id,create_time,update_time,title,children,parents,projects,project_item_type,tags) VALUES
    (11,1,10,'根文档','[12]','[]','[1]','document','[]'),
    (12,2,20,'子文档','[11]','[11]','[1]','document','["读书/摘录"]'),
    (20,1,10,'白板','[]','[]','[1]','white-board','[]'),
    (30,1,30,'未挂接文档','[]','[]','[1]','document','["读书"]');`);
  const context = { now: 1, today: "2026-11-26", timeZone: "Asia/Shanghai", params: {} };
  const query = parseQuery('TABLE id,parent FROM documents WHERE kind="document"');
  const roots = await executeQuery(
    query,
    async request =>
      DataTableQueryTable.read(db, { ...request, options: { projectId: 1, deep: false } }),
    context
  );
  expect(roots.rows.map(row => row.id)).toEqual(["document:11"]);
  const all = await executeQuery(
    query,
    async request =>
      DataTableQueryTable.read(db, { ...request, options: { projectId: 1, deep: true } }),
    context
  );
  expect(all.rows.map(row => [row.id, row.values.parent])).toEqual([
    ["document:11", ""],
    ["document:12", "根文档"],
  ]);
  const tagged = await DataTableQueryTable.read(db, {
    source: "documents",
    options: { projectId: 1, tag: "读书", updatedAfter: 20 },
  });
  expect(tagged.items.map(row => row.id)).toEqual(["document:12"]);
});

it("普通数据库分页保留全部行，将日期与选项投影为查询协议", async () => {
  const table = DataTableTable.create(db, {
    columns: [
      { id: "date", title: "日期", type: "date" },
      {
        id: "status",
        title: "状态",
        type: "select",
        config: { options: [{ id: "option-1", name: "进行中" }] },
      },
    ],
    rows: Array.from({ length: 205 }, (_, index) => ({
      id: `r:${index}`,
      date: { start: 123456, end: null },
      status: "option-1",
    })),
  });
  const first = await DataTableQueryTable.read(db, {
    source: "tables",
    options: { tableId: table.id },
  });
  const second = await DataTableQueryTable.read(db, {
    source: "tables",
    options: { tableId: table.id },
    cursor: first.cursor,
  });
  expect([...first.items, ...second.items].map(row => row.id)).toEqual(
    Array.from({ length: 205 }, (_, index) => `r:${index}`)
  );
  expect(first.items[0]).toEqual({ id: "r:0", date: 123456, status: "进行中" });
  expect(second.cursor).toBeUndefined();
  const result = await executeQuery(
    parseQuery('TABLE id, field("date") AS "日期", field("status") AS "状态" FROM tables'),
    async request => DataTableQueryTable.read(db, request),
    { now: 0, today: "2026-11-25", timeZone: "Asia/Shanghai", params: { tableId: table.id } }
  );
  expect(new Set(result.rows.map(row => row.id))).toEqual(
    new Set(Array.from({ length: 205 }, (_, index) => `r:${index}`))
  );
  expect(result.columns.map(column => column.type)).toEqual(["text", "date", "select"]);
});
