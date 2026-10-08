import { describe, expect, it } from "vitest";
import { createDatabaseStore } from "../../DatabaseStore";
import PluginManager from "../../PluginManager";
import type { CellPlugin, ColumnDef, FilterGroup, RowData, TableViewConfig } from "../../types";

function fixture() {
  const plugins = new PluginManager();
  plugins.registerPlugin({
    type: "value",
    name: "值",
    Renderer: () => null,
    Icon: () => null,
    getGroupKey: (row, column) => String(row[column.id]),
    sort: ({ a, b, direction }) => (Number(a) - Number(b)) * (direction === "asc" ? 1 : -1),
    filters: [
      { operator: "is", label: "等于", filter: (value, row, column) => row[column.id] === value },
    ],
  } as CellPlugin<unknown>);
  const columns: ColumnDef[] = [
    { id: "name", type: "value", title: "名称" },
    { id: "hidden", type: "value", title: "隐藏", hidden: true },
    { id: "score", type: "value", title: "分数" },
    { id: "group", type: "value", title: "分组" },
  ];
  const rows: RowData[] = [
    { id: "a", name: "apple", score: 3, group: "Y" },
    { id: "b", name: "berry", score: 2, group: "X" },
    { id: "c", name: "apricot", score: 1, group: "Y" },
    { id: "d", name: "dates", score: 2, group: "X" },
  ];
  const config: TableViewConfig = {
    columnOrder: columns.map(column => column.id),
    rowOrder: rows.map(row => row.id),
    sorts: [],
    filters: null,
    groupBy: null,
  };
  return {
    store: createDatabaseStore(columns, rows, config, [], undefined, plugins),
    plugins,
    rows,
  };
}

const filter = (fieldId: string, value: string): FilterGroup => ({
  id: fieldId,
  type: "group",
  logic: "and",
  children: [{ id: fieldId, type: "condition", fieldId, operator: "is", value }],
});

describe("统一查询投影", () => {
  it("隐藏列不改变拖拽目标身份，列重排后键盘使用新的可见列序", () => {
    const { store } = fixture();
    store.getState().moveColumn("name", "score");
    expect(store.getState().viewConfig.columnOrder).toEqual(["hidden", "score", "name", "group"]);
    expect(store.getState().projection.columnIds).toEqual(["score", "name", "group"]);
    store.getState().selectCell("a", "score");
    store.getState().moveCellSelection("right");
    expect(store.getState().selectedCell).toEqual({ rowId: "a", columnId: "name" });
  });
  it("视图切换原子更新配置和投影，重命名和重排不恢复过期配置", () => {
    const { store } = fixture();
    const config = store.getState().viewConfig;
    const view = (id: number, rowOrder: string[]) => ({
      id,
      name: String(id),
      type: "table" as const,
      order: id,
      config: { ...config, rowOrder },
    });
    store
      .getState()
      .dispatch(
        { type: "view.receive", view: view(1, ["a", "b", "c", "d"]), activate: true },
        "external"
      );
    store
      .getState()
      .dispatch({ type: "view.receive", view: view(2, ["d", "c", "b", "a"]) }, "external");
    store.getState().setFilters(filter("group", "Y"));
    store.getState().selectCell("a", "name");
    store.getState().setActiveViewId(2);
    expect(store.getState().projection.rowIds).toEqual(["d", "c", "b", "a"]);
    expect(store.getState().selectedCell).toBeNull();
    store.getState().setActiveViewId(1);
    expect(store.getState().projection.rowIds).toEqual(["a", "c"]);
    const current = store.getState().views.find(view => view.id === 1)!;
    store
      .getState()
      .dispatch({ type: "view.receive", view: { ...current, name: "新名字" } }, "external");
    store.getState().dispatch({ type: "views.reorder", ids: [2, 1] });
    expect(store.getState().projection.rowIds).toEqual(["a", "c"]);
    store.getState().dispatch({ type: "view.remove", id: 1 }, "external");
    expect(store.getState().activeViewId).toBe(2);
    expect(store.getState().projection.rowIds).toEqual(["d", "c", "b", "a"]);
  });

  it("看板列顺序与组内行序由核心统一投影，重排仍按记录 ID", () => {
    const { store } = fixture();
    store.getState().editColumn("group", {
      type: "select",
      config: {
        options: [
          { id: "X", name: "X" },
          { id: "Y", name: "Y" },
          { id: "Z", name: "Z" },
        ],
      },
    });
    const view = {
      id: 1,
      name: "看板",
      type: "kanban" as const,
      order: 0,
      config: {
        ...store.getState().viewConfig,
        kanbanConfig: { groupColumnId: "group", columnOrder: ["Y", "X", "Z"] },
      },
    };
    store.getState().dispatch({ type: "view.receive", view, activate: true }, "external");
    expect(store.getState().projection.rowIds).toEqual(["a", "c", "b", "d"]);
    expect(store.getState().projection.groups.map(group => group.label)).toEqual(["Y", "X", "Z"]);
    store.getState().setQuery({ searchResults: ["d", "c", "b", "a"], grouping: "none" });
    expect(store.getState().projection.rowIds).toEqual(["c", "a", "d", "b"]);
    store.getState().selectCell("a", "name");
    store.getState().moveCellSelection("down");
    expect(store.getState().selectedCell?.rowId).toBe("d");
    store.getState().setQuery({ searchResults: null });
    store.getState().moveRow("a", "c");
    expect(store.getState().projection.rowIds).toEqual(["c", "a", "b", "d"]);
  });
  it("过滤、文本搜索、排序、隐藏列与键盘消费同一结果", () => {
    const { store } = fixture();
    store.getState().setFilters(filter("group", "Y"));
    store.getState().setQuery({ text: "ap" });
    store
      .getState()
      .setSorts([{ id: "score-sort", fieldId: "score", direction: "asc", priority: 0 }]);
    expect(store.getState().projection.rowIds).toEqual(["c", "a"]);
    store.getState().selectCell("c", "name");
    store.getState().moveCellSelection("down");
    expect(store.getState().selectedCell).toEqual({ rowId: "a", columnId: "name" });
    store.getState().moveCellSelection("right");
    expect(store.getState().selectedCell).toEqual({ rowId: "a", columnId: "score" });
    store.getState().setQuery({ filters: filter("name", "apricot") });
    expect(store.getState().projection.rowIds).toEqual(["c"]);
    expect(store.getState().selectedCell).toBeNull();
  });

  it("相关性和分组策略独立，清空会话查询恢复保存的视图", () => {
    const { store } = fixture();
    store.getState().setGroupBy({ id: "grouping", fieldId: "group" });
    store
      .getState()
      .setSorts([{ id: "score-sort", fieldId: "score", direction: "asc", priority: 0 }]);
    const saved = store.getState().viewConfig;
    expect(store.getState().projection.rowIds).toEqual(["b", "d", "c", "a"]);
    store.getState().setQuery({ searchResults: ["a", "d", "b", "c"], grouping: "none" });
    expect(store.getState().projection.rowIds).toEqual(["a", "d", "b", "c"]);
    expect(store.getState().projection.canReorder).toBe(false);
    store.getState().setQuery({ grouping: "view" });
    expect(store.getState().projection.rowIds).toEqual(["d", "b", "a", "c"]);
    store.getState().selectCell("b", "name");
    store.getState().moveCellSelection("down");
    expect(store.getState().selectedCell?.rowId).toBe("a");
    store.getState().setQuery({ searchResults: null });
    expect(store.getState().viewConfig).toBe(saved);
    expect(store.getState().projection.rowIds).toEqual(["b", "d", "c", "a"]);
  });

  it("过滤后按 ID 拖拽不会错改隐藏行，排序和相关性模式拒绝手动重排", () => {
    const { store } = fixture();
    store.getState().setQuery({ filters: filter("group", "Y") });
    store.getState().moveRow("a", "c");
    expect(store.getState().projection.rowIds).toEqual(["c", "a"]);
    expect(store.getState().viewConfig.rowOrder).toEqual(["b", "c", "a", "d"]);
    store.getState().moveRow("b", "a");
    expect(store.getState().viewConfig.rowOrder).toEqual(["b", "c", "a", "d"]);
    store.getState().setQuery({ searchResults: ["a", "c"] });
    store.getState().moveRow("a", "c");
    expect(store.getState().projection.rowIds).toEqual(["a", "c"]);
    expect(store.getState().viewConfig.rowOrder).toEqual(["b", "c", "a", "d"]);
  });

  it("纯选择不重复查询，变更命令携带来源与字段差量", () => {
    const { store, rows } = fixture();
    const projection = store.getState().projection;
    store.getState().selectCell("a", "name");
    expect(store.getState().projection).toBe(projection);
    store.getState().updateCellValue("a", "name", "本地草稿");
    expect(store.getState().lastChange).toMatchObject({
      source: "user",
      rows: { upsert: [{ id: "a", name: "本地草稿" }], remove: [] },
    });
    store.getState().dispatch(
      {
        type: "rows.receive",
        rows: rows.map(row => (row.id === "a" ? { ...row, score: 9 } : row)),
      },
      "external"
    );
    expect(store.getState().rows[0]).toMatchObject({ name: "本地草稿", score: 9 });
    expect(store.getState().lastChange).toMatchObject({
      source: "external",
      rows: { upsert: [{ id: "a", score: 9 }], remove: [] },
    });
  });
});
