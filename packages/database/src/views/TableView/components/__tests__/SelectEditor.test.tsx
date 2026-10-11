import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import SelectEditor from "../SelectEditor";
import type { ColumnDef, SelectOption } from "../../../../types";

const options: SelectOption[] = [
  { id: "opt-a", name: "选项A", color: "blue" },
  { id: "opt-b", name: "选项B", color: "green" },
];
const column = { id: "c1", title: "状态", type: "select", config: { options } } as ColumnDef<{
  options: SelectOption[];
}>;

let root: Root | undefined;
let host: HTMLDivElement;

const renderEditor = (value: string | string[], multiple: boolean) => {
  const onCellValueChange = vi.fn();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  void act(() => {
    root!.render(
      <SelectEditor
        value={value}
        column={column}
        onCellValueChange={onCellValueChange}
        onFinishEdit={() => undefined}
        onColumnChange={() => undefined}
        theme="light"
        multiple={multiple}
      />
    );
  });
  return onCellValueChange;
};

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  host?.remove();
});

const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });

/** 弹层里的选项行（VerticalSelectList 的行 div 带 cursor-pointer + p-1） */
const optionRow = (name: string) =>
  Array.from(document.querySelectorAll(".cursor-pointer.p-1")).find(
    el => el.textContent?.trim() === name
  );

describe("SelectEditor multiple", () => {
  it("多选：点击选项在已选数组上叠加", () => {
    const onCellValueChange = renderEditor(["opt-a"], true);
    click(host.querySelector("div")!);
    expect(optionRow("选项B")).toBeTruthy();
    click(optionRow("选项B")!);
    expect(onCellValueChange).toHaveBeenCalledWith(["opt-a", "opt-b"]);
  });

  it("单选：点击选项替换已选值", () => {
    const onCellValueChange = renderEditor("opt-a", false);
    click(host.querySelector("div")!);
    click(optionRow("选项B")!);
    expect(onCellValueChange).toHaveBeenCalledWith("opt-b");
  });
});
