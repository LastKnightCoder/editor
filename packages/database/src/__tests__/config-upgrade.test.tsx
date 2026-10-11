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
  /** 声明配置版本 3 的测试字段：迁移逐级补 v 键 */
  const versionedModel = defineFieldModel<{ v?: number }>({
    type: "versioned",
    toText: () => "",
    configVersion: 3,
    migrateConfig: (config: unknown, fromVersion: number) => ({
      ...(config as object),
      v: fromVersion + 1,
    }),
  });
  const versionedPlugin: CellPlugin<{ v?: number }> = {
    type: "versioned",
    name: "版本字段",
    model: versionedModel,
    Renderer: () => null,
  };
  return { builtInPlugins: [versionedPlugin] };
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

it("初始化时升级初始列配置且不触发 onDataChange（打开不写库）", async () => {
  const onDataChange = vi.fn();
  await act(async () =>
    root.render(
      <Database
        {...baseProps([{ id: "v1", title: "版本列", type: "versioned", config: { old: true } }])}
        onDataChange={onDataChange}
      />
    )
  );
  const column = mocks.store!.getState().columns[0];
  expect(column.config).toEqual({ old: true, v: 3 });
  expect(column.configVersion).toBe(3);
  expect(onDataChange).not.toHaveBeenCalled();
});

it("新建列写入 model 声明的当前 configVersion", async () => {
  const ref = createRef<DatabaseRef>();
  await act(async () =>
    root.render(
      <Database
        ref={ref}
        {...baseProps([
          { id: "v1", title: "版本列", type: "versioned", config: { v: 3 }, configVersion: 3 },
        ])}
      />
    )
  );
  await act(async () => {
    mocks.store!.getState().addColumn({ title: "新列", type: "versioned" });
  });
  const created = mocks.store!.getState().columns.find(column => column.title === "新列");
  expect(created?.configVersion).toBe(3);
});

it("外部 column.configure 到达的配置按列当前版本落位，不重复迁移", async () => {
  const ref = createRef<DatabaseRef>();
  const columns = [
    { id: "v1", title: "版本列", type: "versioned", config: { v: 3 }, configVersion: 3 },
  ];
  await act(async () => root.render(<Database ref={ref} {...baseProps(columns)} />));
  await act(async () => {
    ref.current!.dispatch(
      { type: "column.configure", id: "v1", config: { v: 3, extra: 1 } },
      "external"
    );
  });
  const column = mocks.store!.getState().columns[0];
  // 已是当前版本的列：到达 config 按列版本对待，不再追加迁移键
  expect(column.config).toEqual({ v: 3, extra: 1 });
  expect(column.configVersion).toBe(3);
});

it("外部 column.configure 对旧版本列仍执行升级", async () => {
  const ref = createRef<DatabaseRef>();
  const columns = [{ id: "v1", title: "版本列", type: "versioned", config: { old: true } }];
  await act(async () => root.render(<Database ref={ref} {...baseProps(columns)} />));
  // 初始化已升级到 v3；此处模拟另一路列（configVersion 未升）由外部推送旧形态配置
  await act(async () => {
    mocks.store!.setState({
      columns: [{ id: "v1", title: "版本列", type: "versioned", config: { old: true } }],
    });
    ref.current!.dispatch(
      { type: "column.configure", id: "v1", config: { pushed: true } },
      "external"
    );
  });
  const column = mocks.store!.getState().columns[0];
  expect(column.config).toEqual({ pushed: true, v: 3 });
  expect(column.configVersion).toBe(3);
});

it("编辑列改类型或重写配置时，configVersion 对齐目标字段的当前版本", async () => {
  const columns = [{ id: "v1", title: "文本列", type: "text", config: undefined }];
  await act(async () => root.render(<Database {...baseProps(columns)} />));
  await act(async () => {
    mocks.store!.getState().editColumn("v1", { type: "versioned", config: { v: 3 } });
  });
  expect(mocks.store!.getState().columns[0].configVersion).toBe(3);

  // 换回未声明版本的字段：版本号移除，避免把旧版本号带给另一种字段
  await act(async () => {
    mocks.store!.getState().editColumn("v1", { type: "text", config: undefined });
  });
  expect(mocks.store!.getState().columns[0].configVersion).toBeUndefined();

  // 只改标题不动版本
  await act(async () => {
    mocks.store!.getState().editColumn("v1", { type: "versioned", config: { v: 3 } });
    mocks.store!.getState().editColumn("v1", { title: "改名" });
  });
  expect(mocks.store!.getState().columns[0].configVersion).toBe(3);
});
