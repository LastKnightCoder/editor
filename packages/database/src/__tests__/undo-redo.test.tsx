import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { afterEach, expect, it, vi } from "vitest";
import Database, { type DatabaseRef } from "../Database";
import type { DatabaseProps, TableViewConfig } from "../types";

const mocks = vi.hoisted(() => ({ state: null as Record<string, unknown> | null }));
vi.mock("../views/TableView", async () => {
  const { default: useStore } = await import("../hooks/useDatabaseStore");
  return {
    default: function Table() {
      const state = useStore(s => s);
      mocks.state = state as unknown as Record<string, unknown>;
      return (
        <div data-table-probe>
          <button data-edit onClick={() => state.updateCellValue("r1", "value", "改后")} />
          <button data-delete-row onClick={() => state.deleteRow("r2")} />
          <button data-delete-column onClick={() => state.deleteColumn("extra")} />
          <button data-start-editing onClick={() => state.startEditing("r1", "value")} />
          <button
            data-set-filters
            onClick={() =>
              state.setFilters({ id: "f1", type: "group", logic: "and", children: [] })
            }
          />
          <button data-resize onClick={() => state.resizeColumn("value", 333)} />
          <button data-move-column onClick={() => state.moveColumn("extra", "value")} />
          <input data-inside-input />
        </div>
      );
    },
  };
});

let root: Root | undefined;
let host: HTMLDivElement;
let outsideInput: HTMLInputElement | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  host?.remove();
  outsideInput?.remove();
  outsideInput = undefined;
  mocks.state = null;
});

const columns: DatabaseProps["columns"] = [
  { id: "value", title: "值", type: "text" },
  { id: "extra", title: "备注", type: "text" },
];

const mount = async (overrides: Partial<DatabaseProps> = {}) => {
  const ref = createRef<DatabaseRef>();
  const save = vi.fn();
  const saveView = vi.fn();
  const config: TableViewConfig = {
    columnOrder: ["value", "extra"],
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
          columns={columns}
          data={[
            { id: "r1", value: "原值", extra: "备注一" },
            { id: "r2", value: "二", extra: "备注二" },
          ]}
          views={[{ id: 1, name: "表格", type: "table", order: 0, config }]}
          activeViewId={1}
          viewConfig={config}
          onDataChange={save}
          onViewConfigChange={saveView}
          {...overrides}
        />
      </DndProvider>
    )
  );
  const owner = host.querySelector<HTMLElement>('[tabindex="-1"]')!;
  return { ref, owner, save, saveView };
};

const rows = () =>
  (mocks.state as unknown as { rows: { id: string; [key: string]: unknown }[] }).rows;
const stateOf = () =>
  mocks.state as unknown as { viewConfig: TableViewConfig; columns: typeof columns };

const click = async (selector: string) => {
  await act(async () => {
    host.querySelector<HTMLElement>(selector)!.click();
  });
};

const keydown = (target: Element, init: KeyboardEventInit) => {
  let defaultAllowed = true;
  act(() => {
    defaultAllowed = target.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", bubbles: true, cancelable: true, ...init })
    );
  });
  return defaultAllowed;
};
const cmdZ = (target: Element, shift = false) =>
  keydown(target, { metaKey: true, shiftKey: shift });
const ctrlZ = (target: Element) => keydown(target, { ctrlKey: true });
const ctrlY = (target: Element) => keydown(target, { key: "y", ctrlKey: true });

it("第一次修改单元格后 Cmd+Z 恢复原值并保存，Shift+Cmd+Z 重做", async () => {
  const { owner, save } = await mount();
  await click("[data-edit]");
  expect(rows()[0].value).toBe("改后");
  expect(save).toHaveBeenCalledTimes(1);

  const notDefaulted = cmdZ(owner);
  expect(notDefaulted).toBe(false); // 命中并 preventDefault
  expect(rows()[0].value).toBe("原值");
  expect(save).toHaveBeenCalledTimes(2);
  const [savedData, change] = save.mock.calls[1];
  expect(change.source).toBe("user");
  expect(change.rows.upsert).toEqual([{ id: "r1", value: "原值" }]);
  expect(savedData.rows[0].value).toBe("原值");

  cmdZ(owner, true);
  expect(rows()[0].value).toBe("改后");
  expect(save).toHaveBeenCalledTimes(3);
});

it("删除行后撤销：行回来且在 upsert 与 inserted 中", async () => {
  const { owner, save } = await mount();
  await click("[data-delete-row]");
  expect(rows().map(row => row.id)).toEqual(["r1"]);
  expect(save.mock.calls[0][1].rows.remove).toEqual(["r2"]);

  cmdZ(owner);
  expect(rows().map(row => row.id)).toEqual(["r1", "r2"]);
  const change = save.mock.calls[1][1];
  expect(change.rows.inserted).toEqual(["r2"]);
  expect(change.rows.upsert).toEqual([{ id: "r2", value: "二", extra: "备注二" }]);
});

it("删除列后撤销：列与该列单元格值回来", async () => {
  const { owner, save } = await mount();
  await click("[data-delete-column]");
  expect(stateOf().columns.map(column => column.id)).toEqual(["value"]);
  expect(rows()[0]?.extra).toBeUndefined();

  cmdZ(owner);
  expect(stateOf().columns.map(column => column.id)).toEqual(["value", "extra"]);
  expect(rows()[0].extra).toBe("备注一");
  const change = save.mock.calls[1][1];
  expect(change.columnsChanged).toBe(true);
  expect(change.rows.upsert).toContainEqual(expect.objectContaining({ id: "r1", extra: "备注一" }));
});

it("撤销不改变视图配置：筛选、表尾与列宽保持", async () => {
  const { owner, save, saveView } = await mount();
  await click("[data-set-filters]");
  await click("[data-resize]");
  expect(saveView).toHaveBeenCalledTimes(2);
  await click("[data-edit]");

  cmdZ(owner);
  expect(rows()[0].value).toBe("原值");
  expect(stateOf().viewConfig.filters).toEqual({
    id: "f1",
    type: "group",
    logic: "and",
    children: [],
  });
  expect(stateOf().columns[0].width).toBe(333);
  expect(stateOf().viewConfig.columnWidths?.value).toBe(333);
  expect(save).toHaveBeenCalledTimes(3); // resize 与编辑各一次，undo 一次（筛选不触发数据保存）
  expect(saveView).toHaveBeenCalledTimes(2); // 筛选与 resize 各一次，undo 未触发视图配置保存
});

it("外部 rows.apply 后撤销栈清空，Cmd+Z 不回滚外部数据", async () => {
  const { ref, owner, save } = await mount();
  await click("[data-edit]");
  expect(save).toHaveBeenCalledTimes(1);

  await act(async () => {
    ref.current?.dispatch(
      { type: "rows.apply", changes: { upsert: [{ id: "r1", value: "外部" }], remove: [] } },
      "external"
    );
  });
  expect(rows()[0].value).toBe("外部");

  cmdZ(owner);
  expect(rows()[0].value).toBe("外部");
  expect(save).toHaveBeenCalledTimes(1);
});

it("移动列只改视图 order，不污染撤销历史", async () => {
  const { owner } = await mount();
  await click("[data-edit]");
  await click("[data-move-column]");
  expect(stateOf().viewConfig.columnOrder).toEqual(["extra", "value"]);

  cmdZ(owner);
  expect(rows()[0].value).toBe("原值");
  expect(stateOf().viewConfig.columnOrder).toEqual(["extra", "value"]); // 移动不被撤销
});

it.each(["输入框", "输入法组合", "编辑中", "实例外", "readonly"])(
  "%s 让位撤销快捷键",
  async label => {
    const { owner, save } = await mount(label === "readonly" ? { readonly: true } : {});
    await click("[data-edit]");
    expect(save).toHaveBeenCalledTimes(1);

    if (label === "输入框") {
      const input = host.querySelector<HTMLInputElement>("[data-inside-input]")!;
      await act(async () => input.focus());
      expect(keydown(input, { metaKey: true })).toBe(true);
    } else if (label === "输入法组合") {
      const composing = new KeyboardEvent("keydown", {
        key: "z",
        bubbles: true,
        cancelable: true,
        metaKey: true,
      });
      Object.defineProperty(composing, "isComposing", { value: true });
      let defaultAllowed = true;
      act(() => {
        defaultAllowed = owner.dispatchEvent(composing);
      });
      expect(defaultAllowed).toBe(true);
    } else if (label === "编辑中") {
      await click("[data-start-editing]");
      cmdZ(owner);
    } else if (label === "实例外") {
      outsideInput = document.createElement("input");
      document.body.append(outsideInput);
      cmdZ(outsideInput);
    } else {
      cmdZ(owner);
    }

    expect(rows()[0].value).toBe("改后");
    expect(save).toHaveBeenCalledTimes(1);
  }
);

it("Ctrl+Z 撤销、Ctrl+Y 重做", async () => {
  const { owner } = await mount();
  await click("[data-edit]");
  ctrlZ(owner);
  expect(rows()[0].value).toBe("原值");
  ctrlY(owner);
  expect(rows()[0].value).toBe("改后");
});
