import Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));

import DataTableViewTable from "../data-table-view";

describe("数据表视图配置白名单（viewOptions / columnWidths）", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(schema);
  });

  const createView = (config: unknown) =>
    DataTableViewTable.create(db, {
      tableId: 1,
      name: "视图",
      type: "table",
      order: 1,
      config: config as never,
    });

  it("viewOptions 按视图类型原样保留嵌套结构，未知视图类型子键也保留", () => {
    const viewOptions = {
      kanban: {
        groupColumnId: "status",
        cardDisplay: { template: "task", visibleFieldIds: ["a"] },
      },
      calendar: { dateColumnId: "date" },
      timeline: { custom: { nested: [1, 2] } },
    };
    expect(createView({ viewOptions }).config.viewOptions).toEqual(viewOptions);
  });

  it("viewOptions 非对象或子键非对象时丢弃", () => {
    expect(createView({ viewOptions: "bad" }).config.viewOptions).toBeUndefined();
    expect(createView({ viewOptions: [1] }).config.viewOptions).toBeUndefined();
    expect(
      createView({ viewOptions: { kanban: "bad", calendar: null, gallery: [] } }).config.viewOptions
    ).toBeUndefined();
  });

  it("columnWidths 只保留有限数字", () => {
    expect(
      createView({
        columnWidths: { title: 200, status: 180.5, bad: "wide", nan: NaN, inf: Infinity },
      }).config.columnWidths
    ).toEqual({ title: 200, status: 180.5 });
    expect(createView({ columnWidths: { bad: "wide" } }).config.columnWidths).toBeUndefined();
    expect(createView({ columnWidths: null }).config.columnWidths).toBeUndefined();
  });

  it("旧顶层专属键不再保留", () => {
    const view = createView({
      galleryConfig: { coverType: "detail" },
      calendarConfig: { dateColumnId: "date" },
      kanbanConfig: { groupColumnId: "status" },
    });
    expect(view.config).not.toHaveProperty("galleryConfig");
    expect(view.config).not.toHaveProperty("calendarConfig");
    expect(view.config).not.toHaveProperty("kanbanConfig");
  });

  it("viewOptions 深拷贝落库，写路径不共享渲染端引用", () => {
    const viewOptions = { kanban: { groupColumnId: "status" } };
    const view = createView({ viewOptions });
    viewOptions.kanban.groupColumnId = "changed";
    expect(DataTableViewTable.getById(db, view.id)?.config.viewOptions).toEqual({
      kanban: { groupColumnId: "status" },
    });
  });
});
