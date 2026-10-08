import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { afterEach, expect, it, vi } from "vitest";
import Database, { type DatabaseRef } from "../Database";
import type { CellPlugin, TableViewConfig } from "../types";

const mocks = vi.hoisted(() => ({ focusTarget: null as HTMLElement | null, stopped: vi.fn() }));
vi.mock("../views/TableView", async () => {
  const { default: Cell } = await import("../views/TableView/components/Cell");
  const { default: useStore } = await import("../hooks/useDatabaseStore");
  return {
    default: function Table({
      pluginManager,
    }: {
      pluginManager: import("../PluginManager").PluginManager;
    }) {
      const state = useStore(state => state);
      const column = state.columns[0];
      return (
        <div data-table-probe data-selected={state.selectedCell?.rowId}>
          {state.rows.map(row => (
            <Cell
              key={row.id}
              rowId={row.id}
              columnId={column.id}
              column={column}
              value={row[column.id]}
              width={200}
              isSelected={state.selectedCell?.rowId === row.id}
              isEditing={state.editingCell?.rowId === row.id}
              theme="light"
              readonly={false}
              plugin={pluginManager.getPlugin(column.type) as CellPlugin<unknown>}
              onSelect={state.selectCell}
              onDoubleClick={state.startEditing}
              onStartEditing={state.startEditing}
              onStopEditing={() => {
                mocks.stopped();
                state.stopEditing();
                mocks.focusTarget?.focus();
              }}
              onValueChange={state.updateCellValue}
              onColumnChange={() => undefined}
            />
          ))}
        </div>
      );
    },
  };
});

let root: Root | undefined;
let host: HTMLDivElement;
let outside: HTMLElement | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  host?.remove();
  outside?.remove();
  outside = undefined;
  mocks.focusTarget = null;
  mocks.stopped.mockClear();
});

const mount = async (type: "text" | "number" | "link") => {
  const ref = createRef<DatabaseRef>();
  const config: TableViewConfig = {
    columnOrder: ["value"],
    rowOrder: ["r1", "r2"],
    sorts: [],
    filters: null,
  };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <DndProvider backend={HTML5Backend}>
        <Database
          ref={ref}
          columns={[{ id: "value", title: "列", type }]}
          data={[
            { id: "r1", value: type === "number" ? 1 : "一" },
            { id: "r2", value: type === "number" ? 2 : "二" },
          ]}
          views={[{ id: 1, name: "表格", type: "table", order: 0, config }]}
          activeViewId={1}
          viewConfig={config}
        />
      </DndProvider>
    )
  );
  const owner = host.querySelector<HTMLElement>('[tabindex="-1"]')!;
  const firstCell = host.querySelector<HTMLElement>("[data-table-probe] > div")!;
  await act(async () => {
    firstCell.click();
    owner.focus();
    owner.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
    );
  });
  const editor = host.querySelector<HTMLElement>('[contenteditable="plaintext-only"]')!;
  // jsdom 不提供 contentEditable 的原生聚焦能力，保留真实 EditText 的输入与提交事件。
  editor.tabIndex = 0;
  Object.defineProperty(editor, "isContentEditable", { value: true });
  await act(async () => editor.focus());
  expect(document.activeElement).toBe(editor);
  return { owner, editor };
};

it.each(["text", "number", "link"] as const)(
  "%s 编辑器 Enter 提交后可连续导航与重新编辑，关闭只提交一次",
  async type => {
    const { owner, editor } = await mount(type);
    await act(async () =>
      editor.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
      )
    );
    expect(document.activeElement).toBe(owner);
    expect(mocks.stopped).toHaveBeenCalledTimes(1);
    await act(async () =>
      owner.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
    );
    expect(host.querySelector("[data-selected]")?.getAttribute("data-selected")).toBe("r2");
    await act(async () =>
      owner.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
      )
    );
    expect(host.querySelector('[contenteditable="plaintext-only"]')).not.toBeNull();
  }
);

it.each(["外部输入", "其他实例", "浮层"])("提交时焦点已转移到%s，实例不抢焦点", async label => {
  const { editor } = await mount("text");
  outside = document.createElement(label === "其他实例" ? "div" : "input");
  outside.tabIndex = 0;
  document.body.append(outside);
  mocks.focusTarget = outside;
  await act(async () =>
    editor.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
    )
  );
  expect(document.activeElement).toBe(outside);
});
