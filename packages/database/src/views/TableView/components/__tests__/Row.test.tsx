import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Row from "../Row";
import type PluginManager from "../../../../PluginManager";
import type { CellPlugin } from "../../../../types";

const plugin: CellPlugin<unknown> = {
  type: "text",
  name: "文本",
  editable: true,
  Renderer: ({ value }) => <span>{String(value ?? "")}</span>,
  Editor: () => null,
};

const pluginManager = {
  getPlugin: (type: string) => (type === "text" ? plugin : undefined),
  transformAfterLoad: (_type: string, value: unknown) => value,
} as unknown as PluginManager;

describe("表格行拖拽手柄", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const renderRow = (props: {
    moveRow?: () => void;
    readonly?: boolean;
    reorderDisabledReason?: string;
  }) =>
    act(() =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Row
            row={{ id: "r1", title: "一" }}
            rowIndex={1}
            columns={[{ id: "title", title: "标题", type: "text" }]}
            columnOrder={["title"]}
            columnWidths={{}}
            theme="light"
            readonly={props.readonly ?? false}
            pluginManager={pluginManager}
            selectedCell={null}
            editingCell={null}
            onCellSelect={vi.fn()}
            onCellDoubleClick={vi.fn()}
            onStartEditing={vi.fn()}
            onStopEditing={vi.fn()}
            onCellChange={vi.fn()}
            onColumnChange={vi.fn()}
            moveRow={props.moveRow}
            reorderDisabledReason={props.reorderDisabledReason}
            deleteRow={vi.fn()}
          />
        </DndProvider>
      )
    );

  it("可排序时：拖拽源只绑在手柄上，整行不再可拖", () => {
    renderRow({ moveRow: vi.fn() });
    const handle = container.querySelector<HTMLElement>('[title="拖拽调整顺序"]')!;
    expect(handle).not.toBeNull();
    expect(handle.getAttribute("draggable")).toBe("true");
    expect(handle.className).toContain("cursor-grab");
    // 行根节点仅作放置目标与拖拽预览，不再携带 draggable，单元格文本恢复可选
    expect(handle.parentElement!.getAttribute("draggable")).toBeNull();
    expect(container.querySelector("button")!.getAttribute("title")).toBe(
      "拖拽调整顺序，点击打开行操作"
    );
  });

  it("已应用排序时：手柄不可拖，展示原因且不再露出抓取光标", () => {
    renderRow({
      reorderDisabledReason: "已应用排序规则，无法手动调整行顺序",
    });
    const handle = container.querySelector<HTMLElement>(
      '[title="已应用排序规则，无法手动调整行顺序"]'
    )!;
    expect(handle).not.toBeNull();
    expect(handle.getAttribute("draggable")).toBeNull();
    expect(handle.className).toContain("cursor-default");
    expect(handle.className).toContain("select-none");
    expect(handle.className).not.toContain("cursor-grab");
    // 行菜单仍可用，按钮提示让位于不可拖原因
    expect(container.querySelector("button")!.getAttribute("title")).toBe(
      "已应用排序规则，无法手动调整行顺序"
    );
  });

  it("只读时：即使传了 moveRow，手柄也不连接拖拽源", () => {
    renderRow({
      moveRow: vi.fn(),
      readonly: true,
      reorderDisabledReason: "只读模式下无法调整行顺序",
    });
    const handle = container.querySelector<HTMLElement>('[title="只读模式下无法调整行顺序"]')!;
    expect(handle).not.toBeNull();
    expect(handle.getAttribute("draggable")).toBeNull();
  });
});
