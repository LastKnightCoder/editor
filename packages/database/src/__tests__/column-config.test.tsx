import { act, createRef, useContext } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Database, { type DatabaseRef } from "../Database";
import type { DatabaseStoreType } from "../DatabaseContext";
import type { CellPlugin, ColumnDef, DatabaseProps } from "../types";

const mocks = vi.hoisted(() => ({
  store: undefined as DatabaseStoreType | undefined,
}));

vi.mock("../plugins", async () => {
  const { defineFieldModel } = await import("../model");
  const configuredModel = defineFieldModel<{ prefix?: string }>({
    type: "configured",
    toText: () => "",
  });
  const configuredPlugin: CellPlugin<{ prefix?: string }> = {
    type: "configured",
    name: "配置字段",
    model: configuredModel,
    Renderer: () => null,
  };
  return { builtInPlugins: [configuredPlugin] };
});
vi.mock("../hooks", () => ({
  useColumnResize: () => ({ isResizing: false, startResize: () => {} }),
  useKeyboardNavigation: () => {},
  useUndoRedoShortcut: () => {},
}));
vi.mock("../ViewTabs", () => ({ default: () => null }));
vi.mock("../views/GalleryView", () => ({ default: () => null }));
vi.mock("../views/CalendarView", () => ({ default: () => null }));
vi.mock("../views/KanbanView", () => ({ default: () => null }));
vi.mock("../views/TableView", async () => {
  const { DatabaseContext } = await import("../DatabaseContext");
  return {
    default: function MockTableView() {
      const store = useContext(DatabaseContext)!;
      mocks.store = store;
      const state = store();
      return <div>{state.columns.map(column => column.id).join(",")}</div>;
    },
  };
});

let host: HTMLDivElement;
let root: Root;

const viewConfig = {
  columnOrder: ["v1"],
  rowOrder: ["1"],
  sorts: [],
  filters: null,
};

const baseProps = (columns: ColumnDef[]): DatabaseProps => ({
  columns,
  data: [{ id: "1", v1: null }],
  views: [{ id: 1, name: "列表", type: "table", config: viewConfig, order: 0 }],
  activeViewId: 1,
  viewConfig,
});

beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it("初始化保留字段配置且不触发 onDataChange", async () => {
  const onDataChange = vi.fn();
  const config = { prefix: "标题", options: ["甲", "乙"] };
  const columns = [{ id: "v1", title: "配置列", type: "configured", config }];
  await act(async () =>
    root.render(<Database {...baseProps(columns)} onDataChange={onDataChange} />)
  );
  expect(mocks.store!.getState().columns).toEqual(columns);
  expect(onDataChange).not.toHaveBeenCalled();
});

it("外部重复配置保留用户撤销历史", async () => {
  const ref = createRef<DatabaseRef>();
  const config = { prefix: "标题" };
  const columns = [{ id: "v1", title: "配置列", type: "configured", config }];
  await act(async () => root.render(<Database ref={ref} {...baseProps(columns)} />));
  await act(async () => mocks.store!.getState().updateCellValue("1", "v1", "用户输入"));
  const history = mocks.store!.getState().history;
  const historyIndex = mocks.store!.getState().historyIndex;
  expect(historyIndex).toBeGreaterThan(0);
  await act(async () => {
    ref.current!.dispatch(
      { type: "column.configure", id: "v1", config: { ...config } },
      "external"
    );
  });
  expect(mocks.store!.getState().history).toBe(history);
  expect(mocks.store!.getState().historyIndex).toBe(historyIndex);
  await act(async () => mocks.store!.getState().undo());
  expect(mocks.store!.getState().rows[0].v1).toBeNull();
});

it("外部新配置原样应用并重建撤销基线，不回写宿主", async () => {
  const ref = createRef<DatabaseRef>();
  const onDataChange = vi.fn();
  const columns = [{ id: "v1", title: "配置列", type: "configured", config: { prefix: "旧" } }];
  await act(async () =>
    root.render(<Database ref={ref} {...baseProps(columns)} onDataChange={onDataChange} />)
  );
  await act(async () => mocks.store!.getState().updateCellValue("1", "v1", "用户输入"));
  onDataChange.mockClear();
  const config = { prefix: "新", options: ["甲"] };
  await act(async () => {
    ref.current!.dispatch({ type: "column.configure", id: "v1", config }, "external");
  });
  expect(mocks.store!.getState().columns[0].config).toEqual(config);
  expect(mocks.store!.getState().historyIndex).toBe(0);
  expect(onDataChange).not.toHaveBeenCalled();
  await act(async () => mocks.store!.getState().undo());
  expect(mocks.store!.getState().columns[0].config).toEqual(config);
  expect(mocks.store!.getState().rows[0].v1).toBe("用户输入");
});
