import { describe, expect, it } from "vitest";
import { createDatabaseStore } from "../DatabaseStore";
import type { ColumnDef, TableViewConfig } from "../types";

const columns: ColumnDef[] = [
  { id: "a", title: "A", type: "text" },
  { id: "b", title: "B", type: "text" },
  { id: "c", title: "C", type: "text" },
];
const rows = [
  { id: "r1", a: "1", b: "2", c: "3" },
  { id: "r2", a: "4", b: "5", c: "6" },
  { id: "r3", a: "7", b: "8", c: "9" },
];
const config: TableViewConfig = {
  columnOrder: ["a", "b", "c"],
  rowOrder: ["r1", "r2", "r3"],
  sorts: [],
  filters: null,
};
const createStore = () =>
  createDatabaseStore(
    columns,
    rows,
    config,
    [{ id: 1, name: "表格", type: "table", order: 0, config }],
    1
  );

describe("撤销恢复的行列回到删除前的位置", () => {
  it("中间的列撤销后回到原位", () => {
    const store = createStore();
    store.getState().deleteColumn("b");
    expect(store.getState().viewConfig.columnOrder).toEqual(["a", "c"]);
    store.getState().undo();
    expect(store.getState().viewConfig.columnOrder).toEqual(["a", "b", "c"]);
  });

  it("中间的行撤销后回到原位", () => {
    const store = createStore();
    store.getState().deleteRow("r2");
    store.getState().undo();
    expect(store.getState().viewConfig.rowOrder).toEqual(["r1", "r2", "r3"]);
  });

  it("首列撤销后回到最前", () => {
    const store = createStore();
    store.getState().deleteColumn("a");
    store.getState().undo();
    expect(store.getState().viewConfig.columnOrder).toEqual(["a", "b", "c"]);
  });

  it("删除后的拖动保留，恢复的列跟随其原先的左邻", () => {
    const store = createStore();
    store.getState().deleteColumn("b");
    store.getState().moveColumn("c", "a");
    expect(store.getState().viewConfig.columnOrder).toEqual(["c", "a"]);
    store.getState().undo();
    expect(store.getState().viewConfig.columnOrder).toEqual(["c", "a", "b"]);
  });

  it("重做再次删除，撤销第二次仍回原位", () => {
    const store = createStore();
    store.getState().deleteColumn("b");
    store.getState().undo();
    store.getState().redo();
    expect(store.getState().viewConfig.columnOrder).toEqual(["a", "c"]);
    store.getState().undo();
    expect(store.getState().viewConfig.columnOrder).toEqual(["a", "b", "c"]);
  });
});
