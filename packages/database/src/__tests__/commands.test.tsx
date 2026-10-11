import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Menu, toast } from "@tau/ui";
import { afterEach, describe, expect, it, vi } from "vitest";
import Row from "../views/TableView/components/Row";
import ColumnHeader from "../views/TableView/components/ColumnHeader";
import CommandMenuItems from "../components/CommandMenuItems";
import Database from "../Database";
import { defineDatabaseExtension } from "../extensions";
import { createCommandApi, visibleCommands, type DatabaseCommandDefinition } from "../commands";
import { createDatabaseStore } from "../DatabaseStore";
import PluginManager from "../PluginManager";
import { builtInPlugins } from "../plugins";
import type { CellPlugin, ColumnDef, RowData, TableViewConfig } from "../types";

const columns: ColumnDef[] = [
  { id: "title", title: "标题", type: "text", isPrimary: true },
  { id: "qty", title: "数量", type: "number" },
  {
    id: "status",
    title: "状态",
    type: "select",
    config: { options: [{ id: "opt-1", name: "进行中", color: "blue" }] },
  },
];
const rows: RowData[] = [
  { id: "row-a", title: "A", qty: 1, status: "opt-1" },
  { id: "row-b", title: "B", qty: 2, status: null },
];
const viewConfig: TableViewConfig = {
  columnOrder: columns.map(column => column.id),
  rowOrder: rows.map(row => row.id),
  sorts: [],
  filters: null,
};

const buildStore = () => {
  const pluginManager = new PluginManager();
  pluginManager.registerPlugins(builtInPlugins as unknown as CellPlugin<unknown>[]);
  const store = createDatabaseStore(
    columns,
    rows,
    viewConfig,
    [{ id: 1, name: "表格", type: "table", order: 0, config: viewConfig }],
    1,
    pluginManager
  );
  return { store, pluginManager };
};

describe("visibleCommands", () => {
  const api = { readonly: false } as ReturnType<typeof createCommandApi>;
  const defs: DatabaseCommandDefinition[] = [
    { id: "acme.row", label: "行", placement: "row", run: () => undefined },
    { id: "acme.col", label: "列", placement: "column", run: () => undefined },
    {
      id: "acme.rowIf",
      label: "条件",
      placement: "row",
      when: ctx => ctx.rowId === "row-a",
      run: () => undefined,
    },
    {
      id: "acme.throwing",
      label: "抛错",
      placement: "row",
      when: () => {
        throw new Error("when 崩了");
      },
      run: () => undefined,
    },
  ];

  it("按 placement 与 when 过滤；when 抛错按隐藏处理", () => {
    expect(visibleCommands(defs, "row", { api, rowId: "row-a" }).map(def => def.id)).toEqual([
      "acme.row",
      "acme.rowIf",
    ]);
    expect(visibleCommands(defs, "row", { api, rowId: "row-b" }).map(def => def.id)).toEqual([
      "acme.row",
    ]);
    expect(visibleCommands(defs, "column", { api }).map(def => def.id)).toEqual(["acme.col"]);
  });
});

describe("createCommandApi", () => {
  it("updateCells 批量修改只产生一次撤销步", () => {
    const { store, pluginManager } = buildStore();
    const api = createCommandApi(store, pluginManager, () => false);
    api.updateCells([
      { rowId: "row-a", columnId: "title", value: "A2" },
      { rowId: "row-b", columnId: "qty", value: 99 },
    ]);
    expect(store.getState().rows.find(row => row.id === "row-a")?.title).toBe("A2");
    expect(store.getState().rows.find(row => row.id === "row-b")?.qty).toBe(99);

    act(() => store.getState().undo());
    expect(store.getState().rows.find(row => row.id === "row-a")?.title).toBe("A");
    expect(store.getState().rows.find(row => row.id === "row-b")?.qty).toBe(2);
  });

  it("deleteRows 批量删除只产生一次撤销步", () => {
    const { store, pluginManager } = buildStore();
    const api = createCommandApi(store, pluginManager, () => false);
    api.deleteRows(["row-a", "row-b"]);
    expect(store.getState().rows).toHaveLength(0);

    act(() => store.getState().undo());
    expect(store.getState().rows.map(row => row.id)).toEqual(["row-a", "row-b"]);
  });

  it("值按列插件 transformBeforeSave 落库", () => {
    const { store, pluginManager } = buildStore();
    const api = createCommandApi(store, pluginManager, () => false);
    api.updateCells([{ rowId: "row-a", columnId: "status", value: "not-an-option" }]);
    expect(store.getState().rows.find(row => row.id === "row-a")?.status).toBeNull();
  });

  it("readonly 时写方法直接返回，读取返回副本", () => {
    const { store, pluginManager } = buildStore();
    const api = createCommandApi(store, pluginManager, () => true);
    expect(api.readonly).toBe(true);
    api.updateCells([{ rowId: "row-a", columnId: "title", value: "A2" }]);
    api.addRow({ title: "C" });
    api.deleteRows(["row-a"]);
    expect(store.getState().rows).toHaveLength(2);
    expect(store.getState().rows.find(row => row.id === "row-a")?.title).toBe("A");

    const snapshot = api.getRows();
    expect(api.getRow("row-a")).toEqual(rows[0]);
    expect(api.getVisibleRowIds()).toEqual(["row-a", "row-b"]);
    snapshot[0].title = "hack";
    (snapshot[1] as RowData).qty = -1;
    expect(store.getState().rows.find(row => row.id === "row-a")?.title).toBe("A");
    expect(store.getState().rows.find(row => row.id === "row-b")?.qty).toBe(2);
    const columnSnapshot = api.getColumns();
    columnSnapshot[0].title = "hack";
    expect(store.getState().columns[0].title).toBe("标题");
  });
});

let root: Root | undefined;
let host: HTMLDivElement;

const render = (node: React.ReactNode) => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  void act(() => {
    root!.render(<DndProvider backend={HTML5Backend}>{node}</DndProvider>);
  });
  return host;
};

afterEach(async () => {
  vi.restoreAllMocks();
  if (root) await act(async () => root!.unmount());
  root = undefined;
  host?.remove();
});

const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });

// MenuSurface 在关闭时也渲染（invisible + inert），断言只看打开的菜单层
const menuLabels = () =>
  Array.from(document.querySelectorAll('[role="menu"][data-open="true"] [data-menu-item]')).map(
    el => (el as HTMLElement).dataset.label ?? ""
  );

const separatorCount = () =>
  document.querySelectorAll('[role="menu"][data-open="true"] [role="separator"]').length;

const rowCommands: DatabaseCommandDefinition[] = [
  { id: "acme.done", label: "标记完成", placement: "row", run: () => undefined },
  { id: "acme.copy", label: "复制行", placement: "row", run: () => undefined },
];
const columnCommands: DatabaseCommandDefinition[] = [
  { id: "acme.sort", label: "整理排序", placement: "column", run: () => undefined },
];

const rowProps = {
  rowIndex: 1,
  columns,
  columnOrder: columns.map(column => column.id),
  columnWidths: {},
  theme: "light" as const,
  readonly: false,
  selectedCell: null,
  editingCell: null,
  onCellSelect: () => undefined,
  onCellDoubleClick: () => undefined,
  onStartEditing: () => undefined,
  onStopEditing: () => undefined,
  onCellChange: () => undefined,
  onColumnChange: () => undefined,
  deleteRow: () => undefined,
};

describe("扩展命令菜单注入", () => {
  it("行菜单：扩展项排在「删除」之前，二者之间有分隔线", () => {
    const { pluginManager } = buildStore();
    render(
      <Row
        {...rowProps}
        row={rows[0]}
        pluginManager={pluginManager}
        commands={{
          api: createCommandApi(buildStore().store, pluginManager, () => false),
          definitions: rowCommands,
        }}
      />
    );
    click(host.querySelector('button[title="行操作"]')!);
    expect(menuLabels()).toEqual(["标记完成", "复制行", "删除"]);
    expect(separatorCount()).toBe(1);
  });

  it("when 过滤后无扩展项时不加分隔线", () => {
    const { pluginManager } = buildStore();
    const hidden: DatabaseCommandDefinition[] = [
      {
        id: "acme.hidden",
        label: "隐藏",
        placement: "row",
        when: () => false,
        run: () => undefined,
      },
    ];
    render(
      <Row
        {...rowProps}
        row={rows[0]}
        pluginManager={pluginManager}
        commands={{
          api: createCommandApi(buildStore().store, pluginManager, () => false),
          definitions: hidden,
        }}
      />
    );
    click(host.querySelector('button[title="行操作"]')!);
    expect(menuLabels()).toEqual(["删除"]);
    expect(separatorCount()).toBe(0);
  });

  it("列头菜单：扩展项排在「编辑」之后、「删除」之前", () => {
    const { pluginManager } = buildStore();
    const api = createCommandApi(buildStore().store, pluginManager, () => false);
    render(
      <ColumnHeader
        column={columns[1]}
        width={200}
        onResizeStart={() => undefined}
        moveColumn={() => undefined}
        pluginManager={pluginManager}
        theme="light"
        readonly={false}
        commands={{ api, definitions: columnCommands }}
      />
    );
    click(host.querySelector('button[title="列操作"]')!);
    expect(menuLabels()).toEqual(["编辑", "整理排序", "删除"]);
    expect(separatorCount()).toBe(2);
  });

  it("primary 列没有「删除」时，扩展项尾部分隔线随之省略", () => {
    const { pluginManager } = buildStore();
    const api = createCommandApi(buildStore().store, pluginManager, () => false);
    render(
      <ColumnHeader
        column={columns[0]}
        width={200}
        onResizeStart={() => undefined}
        moveColumn={() => undefined}
        pluginManager={pluginManager}
        theme="light"
        readonly={false}
        commands={{ api, definitions: columnCommands }}
      />
    );
    click(host.querySelector('button[title="列操作"]')!);
    expect(menuLabels()).toEqual(["编辑", "整理排序"]);
    expect(separatorCount()).toBe(1);
  });

  it("run 收到 api 与触发点的 rowId / columnId；抛错或 reject 时 toast 报错且不崩", async () => {
    const errorSpy = vi.spyOn(toast, "error").mockImplementation(() => 0);
    const { store, pluginManager } = buildStore();
    const api = createCommandApi(store, pluginManager, () => false);
    const contexts: unknown[] = [];
    const defs: DatabaseCommandDefinition[] = [
      {
        id: "acme.record",
        label: "记录",
        placement: "row",
        run: ctx => {
          contexts.push(ctx);
        },
      },
      {
        id: "acme.throws",
        label: "同步抛错",
        placement: "row",
        run: () => {
          throw new Error("boom");
        },
      },
      {
        id: "acme.rejects",
        label: "异步拒绝",
        placement: "row",
        run: () => Promise.reject(new Error("later")),
      },
    ];
    render(
      <Menu trigger={<button type="button">开</button>}>
        <CommandMenuItems items={defs} api={api} rowId="row-a" columnId="title" />
      </Menu>
    );
    click(host.querySelector("button")!);
    const items = Array.from(document.querySelectorAll("[data-menu-item]"));
    click(items[0]);
    click(items[1]);
    await act(async () => {
      click(items[2]);
      await Promise.resolve();
    });
    expect(contexts).toEqual([{ api, rowId: "row-a", columnId: "title" }]);
    expect(errorSpy).toHaveBeenCalledTimes(2);
    expect(errorSpy.mock.calls.map(call => call[0])).toEqual([
      "命令「同步抛错」执行失败：boom",
      "命令「异步拒绝」执行失败：later",
    ]);
  });

  it("readonly 实例不显示任何扩展命令（Database 端到端）", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    const run = vi.fn();
    const extension = defineDatabaseExtension({
      id: "acme.commands",
      create: () => ({
        commands: [{ id: "acme.col", label: "只读不该出现", placement: "column", run }],
      }),
    });
    render(
      <Database
        columns={columns}
        data={rows}
        views={[{ id: 1, name: "表格", type: "table", order: 0, config: viewConfig }]}
        activeViewId={1}
        viewConfig={viewConfig}
        extensions={[extension]}
        readonly
      />
    );
    // readonly 下列头菜单按钮（连同扩展命令）整体不渲染
    expect(document.querySelector('button[title="列操作"]')).toBeNull();
    expect(document.body.textContent).not.toContain("只读不该出现");
  });

  it("可写实例经 Database 装配后列头出现扩展命令（端到端）", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    const extension = defineDatabaseExtension({
      id: "acme.commands",
      create: () => ({
        commands: [
          { id: "acme.col", label: "整理排序", placement: "column", run: () => undefined },
        ],
      }),
    });
    render(
      <Database
        columns={columns}
        data={rows}
        views={[{ id: 1, name: "表格", type: "table", order: 0, config: viewConfig }]}
        activeViewId={1}
        viewConfig={viewConfig}
        extensions={[extension]}
      />
    );
    const trigger = host.querySelectorAll('button[title="列操作"]')[1];
    click(trigger);
    expect(menuLabels()).toEqual(["编辑", "整理排序", "删除"]);
    expect(separatorCount()).toBe(2);
  });
});
