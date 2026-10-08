import Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));

import DataTableViewTable from "../data-table-view";

describe("数据表视图表尾汇总持久化", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(schema);
  });

  const createView = (footer: unknown) =>
    DataTableViewTable.create(db, {
      tableId: 1,
      name: "表格",
      type: "table",
      order: 1,
      config: { footer } as never,
    });

  it("保存后读回表尾配置", () => {
    const view = createView({ price: { kind: "aggregate", op: "sum" } });
    expect(DataTableViewTable.getById(db, view.id)?.config.footer).toEqual({
      price: { kind: "aggregate", op: "sum" },
    });

    const updated = DataTableViewTable.update(db, {
      ...view,
      config: { ...view.config, footer: { qty: { kind: "aggregate", op: "avg" } } },
    });
    expect(updated?.config.footer).toEqual({ qty: { kind: "aggregate", op: "avg" } });
  });

  it("丢弃结构非法的条目，空表不落键", () => {
    const view = createView({
      a: { kind: "aggregate", op: "max", extra: 1 },
      b: { kind: "expr" },
      c: null,
    });
    expect(view.config.footer).toEqual({ a: { kind: "aggregate", op: "max" } });
    expect(createView({ b: { kind: "expr" } }).config.footer).toBeUndefined();
  });
});
