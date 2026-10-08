import Database from "better-sqlite3";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { cleanup } = vi.hoisted(() => ({ cleanup: vi.fn() }));
vi.mock("../tables/content", () => ({ default: { deleteContent: cleanup } }));
import DataTableTable from "../tables/data-table";

let db: Database.Database;
beforeEach(() => {
  db = new Database(":memory:");
  cleanup.mockClear();
  db.exec(`CREATE TABLE data_tables (id INTEGER PRIMARY KEY, create_time INTEGER, update_time INTEGER,
    columns TEXT, rows TEXT, active_view_id INTEGER, ref_count INTEGER);
    CREATE TABLE data_table_views (id INTEGER PRIMARY KEY, table_id INTEGER, sort_order INTEGER, config TEXT, update_time INTEGER);
    CREATE TABLE operation (id INTEGER PRIMARY KEY, operation_time INTEGER, operation_id INTEGER,
    operation_content_type TEXT, operation_action TEXT);`);
  db.prepare("INSERT INTO data_tables VALUES (1, 11, 22, ?, ?, 8, 1)").run(
    JSON.stringify([{ id: "title", type: "text", title: "名称", width: 600 }]),
    JSON.stringify([
      { id: "r", title: "新实例保存的标题" },
      { id: "s", title: "其他行" },
    ])
  );
});
afterEach(() => db.close());

const attach = () =>
  DataTableTable.patchRow(db, {
    tableId: 1,
    rowId: "r",
    patch: { detailContentId: 71 },
    expected: { detailContentId: null },
  });

it("晚到正文只合并字段补丁，保留新实例的标题、其他行、列配置和活动视图", () => {
  db.exec("BEGIN");
  expect(attach()).toBe(true);
  db.exec("COMMIT");
  const table = DataTableTable.getById(db, 1)!;
  expect(table.rows).toEqual([
    { id: "r", title: "新实例保存的标题", detailContentId: 71 },
    { id: "s", title: "其他行" },
  ]);
  expect(table.columns[0].width).toBe(600);
  expect(table.activeViewId).toBe(8);
});

it("新实例已删除行时拒绝补丁，不恢复行", () => {
  db.prepare("UPDATE data_tables SET rows = ? WHERE id = 1").run(
    JSON.stringify([{ id: "s", title: "其他行" }])
  );
  expect(attach()).toBe(false);
  expect(DataTableTable.getById(db, 1)!.rows).toEqual([{ id: "s", title: "其他行" }]);
});

it("目标字段已被新实例修改时拒绝旧草稿，已有正文不被替换", () => {
  expect(
    DataTableTable.patchRow(db, {
      tableId: 1,
      rowId: "r",
      patch: { title: "旧实例草稿" },
      expected: { title: "旧标题" },
    })
  ).toBe(false);
  expect(attach()).toBe(true);
  expect(
    DataTableTable.patchRow(db, {
      tableId: 1,
      rowId: "r",
      patch: { detailContentId: 72 },
      expected: { detailContentId: 0 },
    })
  ).toBe(false);
  expect(DataTableTable.getById(db, 1)!.rows[0]).toMatchObject({
    title: "新实例保存的标题",
    detailContentId: 71,
  });
});

it("表已删除、字段已删除或缺少预期值时拒绝写入", () => {
  expect(
    DataTableTable.patchRow(db, {
      tableId: 1,
      rowId: "r",
      patch: { removed: "草稿" },
      expected: { removed: null },
    })
  ).toBe(false);
  expect(
    DataTableTable.patchRow(db, { tableId: 1, rowId: "r", patch: { title: "草稿" }, expected: {} })
  ).toBe(false);
  db.exec("UPDATE data_tables SET ref_count = 0 WHERE id = 1");
  expect(attach()).toBe(false);
});

it("晚到补丁先落库，新实例随后编辑的差量仍保留正文引用和活动视图", () => {
  expect(attach()).toBe(true);
  const table = DataTableTable.applyChanges(db, {
    id: 1,
    rows: { upsert: [{ id: "r", title: "随后编辑的标题" }], remove: [] },
  })!;
  expect(table.rows[0]).toMatchObject({ title: "随后编辑的标题", detailContentId: 71 });
  expect(table.activeViewId).toBe(8);
  expect(table.columns[0].width).toBe(600);
});

it("常规删除从最新持久化行释放正文一次，旧实例的后续编辑不恢复行", () => {
  expect(attach()).toBe(true);
  DataTableTable.applyChanges(db, { id: 1, rows: { upsert: [], remove: ["r"] } });
  expect(cleanup).toHaveBeenCalledExactlyOnceWith(db, 71);
  const table = DataTableTable.applyChanges(db, {
    id: 1,
    rows: { upsert: [{ id: "r", title: "旧编辑" }], remove: [] },
  })!;
  expect(table.rows.map(row => row.id)).toEqual(["s"]);
});

it("只允许显式新增行，列修改与行差量不改写其他最新字段", () => {
  expect(attach()).toBe(true);
  const table = DataTableTable.applyChanges(db, {
    id: 1,
    columns: [{ id: "title", title: "名称", type: "text", width: 720 }],
    rows: { upsert: [{ id: "new", title: "新增" }], remove: [], inserted: ["new"] },
  })!;
  expect(table.rows[0].detailContentId).toBe(71);
  expect(table.rows[2]).toEqual({ id: "new", title: "新增" });
  expect(table.columns[0].width).toBe(720);
});
