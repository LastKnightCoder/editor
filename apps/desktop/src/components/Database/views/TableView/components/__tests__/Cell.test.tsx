import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Cell from "../Cell";
import { CellPlugin, CellValue, ColumnDef } from "../../../../types";

// 模拟日期选择器「确定」：同一事件里先回调新值、再结束编辑
const plugin: CellPlugin<unknown> = {
  type: "fake",
  name: "fake",
  editable: true,
  Renderer: ({ value }) => <span data-testid="renderer">{String(value)}</span>,
  Editor: ({ value, onCellValueChange, onFinishEdit }) => (
    <div>
      <span data-testid="editor-value">{String(value)}</span>
      <button data-testid="commit" onClick={() => (onCellValueChange("next"), onFinishEdit())} />
      <button data-testid="clear" onClick={() => (onCellValueChange(""), onFinishEdit())} />
      <button data-testid="draft" onClick={() => onCellValueChange("draft")} />
    </div>
  ),
};

describe("表格单元格编辑", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const onValueChange = vi.fn();
  const onStopEditing = vi.fn();

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    onValueChange.mockReset();
    onStopEditing.mockReset();
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (value: CellValue, isEditing: boolean, column: Partial<ColumnDef> = {}) =>
    act(() =>
      root.render(
        <Cell
          rowId="r1"
          columnId="c1"
          column={{ id: "c1", title: "列", type: "fake", ...column }}
          value={value}
          width={120}
          isSelected
          isEditing={isEditing}
          theme="light"
          readonly={false}
          plugin={plugin}
          onSelect={vi.fn()}
          onDoubleClick={vi.fn()}
          onStartEditing={vi.fn()}
          onStopEditing={onStopEditing}
          onValueChange={onValueChange}
          onColumnChange={vi.fn()}
        />
      )
    );
  const click = (id: string) =>
    act(() => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)!.click());

  it("同一事件内改值并结束编辑，保存的是新值", () => {
    render("prev", true);
    click("commit");
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith("r1", "c1", "next");
    expect(onStopEditing).toHaveBeenCalledOnce();
  });

  it("按最新草稿校验：必填列清空后结束编辑不保存", () => {
    render("prev", true, { validation: { required: true } });
    click("clear");
    expect(onValueChange).not.toHaveBeenCalled();
    expect(onStopEditing).toHaveBeenCalledOnce();
  });

  it("重新进入编辑以当前值重置草稿，不带出上次残留", () => {
    render("prev", true);
    click("draft");
    render("prev", false);
    render("external", false);
    render("external", true);
    expect(container.querySelector('[data-testid="editor-value"]')!.textContent).toBe("external");
  });
});
