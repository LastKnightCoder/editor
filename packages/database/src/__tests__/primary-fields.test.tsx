import { act } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { expect, it, vi } from "vitest";
import { DatabaseContext } from "../DatabaseContext";
import { createDatabaseStore } from "../DatabaseStore";
import PluginManager from "../PluginManager";
import CheckboxPlugin from "../plugins/CheckboxPlugin";
import { defineFieldModel } from "../model/field-model";
import type { CellPlugin, ColumnDef, RowData, TableViewConfig } from "../types";
import Cell from "../views/TableView/components/Cell";
import GalleryCard from "../views/GalleryView/GalleryCard";
import RowDetailModal from "../components/RowDetailModal";

const noop = () => undefined;

it.each(["table", "gallery", "detail"] as const)(
  "重新打开来源为主列的已保存数据，%s 显示标题并保留原始引用",
  async view => {
    // React #31：来源对象曾被主列当作文本直接渲染。
    const saved = JSON.stringify({
      columns: [{ id: "q:source", title: "来源", type: "queryEntity", isPrimary: true }],
      rows: [{ id: "card:7", "q:source": { kind: "card", id: "7", title: "旧笔记" } }],
      config: { columnOrder: ["q:source"], rowOrder: ["card:7"], sorts: [], filters: null },
    });
    const data: { columns: ColumnDef[]; rows: RowData[]; config: TableViewConfig } =
      JSON.parse(saved);
    const openSource = vi.fn();
    const model = defineFieldModel({
      type: "queryEntity",
      toText: value => String(value?.title ?? value?.id ?? ""),
    });
    const sourcePlugin: CellPlugin<unknown> = {
      type: "queryEntity",
      name: "来源",
      model,
      editable: false,
      Renderer: ({ value }) => (
        <button data-source onClick={() => openSource(value)}>
          {model.toText(value, data.columns[0])}
        </button>
      ),
    };
    const plugins = new PluginManager();
    plugins.registerPlugin(sourcePlugin);
    const store = createDatabaseStore(data.columns, data.rows, data.config, [], undefined, plugins);
    const row = store.getState().rows[0];
    const column = data.columns[0];
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          <DndProvider backend={HTML5Backend}>
            <DatabaseContext.Provider value={store}>
              {view === "table" ? (
                <Cell
                  rowId={row.id}
                  columnId={column.id}
                  column={column}
                  value={row[column.id]}
                  row={row}
                  width={240}
                  isSelected={false}
                  isEditing={false}
                  theme="light"
                  readonly
                  plugin={sourcePlugin}
                  onSelect={noop}
                  onDoubleClick={noop}
                  onStartEditing={noop}
                  onStopEditing={noop}
                  onValueChange={noop}
                  onColumnChange={noop}
                />
              ) : view === "gallery" ? (
                <GalleryCard
                  row={row}
                  columns={data.columns}
                  pluginManager={plugins}
                  coverType="detail"
                  theme="light"
                  onClick={noop}
                />
              ) : (
                <RowDetailModal
                  rowId={row.id}
                  columns={data.columns}
                  pluginManager={plugins}
                  theme="light"
                  onClose={noop}
                />
              )}
            </DatabaseContext.Provider>
          </DndProvider>
        )
      );
      expect(document.body.textContent).toContain("旧笔记");
      if (view !== "gallery") {
        const button = document.querySelector<HTMLButtonElement>("[data-source]");
        if (!button) throw new Error("未渲染来源入口");
        await act(async () => button.click());
        expect(openSource).toHaveBeenCalledExactlyOnceWith({
          kind: "card",
          id: "7",
          title: "旧笔记",
        });
      }
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
    const expected = JSON.parse(saved);
    expect(store.getState().columns).toEqual(expected.columns);
    expect(store.getState().rows).toEqual(expected.rows);
    expect(store.getState().viewConfig).toMatchObject(expected.config);
    expect(store.getState().lastChange).toBeNull();
  }
);

it("详情中的勾选主列按布尔值编辑，关闭后保留可再次读取的字段类型", async () => {
  const columns: ColumnDef[] = [{ id: "done", title: "完成", type: "checkbox", isPrimary: true }];
  const plugins = new PluginManager();
  plugins.registerPlugin(CheckboxPlugin);
  const store = createDatabaseStore(
    columns,
    [{ id: "r", done: false }],
    undefined,
    [],
    undefined,
    plugins
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <DatabaseContext.Provider value={store}>
            <RowDetailModal
              rowId="r"
              columns={columns}
              pluginManager={plugins}
              theme="light"
              onClose={noop}
            />
          </DatabaseContext.Provider>
        </DndProvider>
      )
    );
    const checkbox = document.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!checkbox) throw new Error("未渲染勾选主列");
    await act(async () => checkbox.click());
    expect(store.getState().rows[0].done).toBe(true);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
  const restored: RowData[] = JSON.parse(JSON.stringify(store.getState().rows));
  expect(restored[0].done).toBe(true);
});
