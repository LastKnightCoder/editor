import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AddTag from "@/components/AddTag";

vi.mock("react-dnd", () => ({
  useDrag: () => [{ isDragging: false }, (ref: unknown) => ref],
  useDrop: () => [{}, (ref: unknown) => ref],
}));

let host: HTMLDivElement;
let root: Root;
const caretRangeFromPoint = vi.fn();
const originalCaret = Object.getOwnPropertyDescriptor(document, "caretRangeFromPoint");

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  caretRangeFromPoint.mockReset();
  Object.defineProperty(document, "caretRangeFromPoint", {
    configurable: true,
    value: caretRangeFromPoint,
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <AddTag tags={["测试标签"]} addTag={vi.fn()} removeTag={vi.fn()} editTag={vi.fn()} />
    )
  );
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  window.getSelection()?.removeAllRanges();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (originalCaret) {
    Object.defineProperty(document, "caretRangeFromPoint", originalCaret);
  } else {
    Reflect.deleteProperty(document, "caretRangeFromPoint");
  }
});

function startEditing() {
  const label = Array.from(host.querySelectorAll("span")).find(
    element => element.textContent === "测试标签"
  )!;
  act(() =>
    label.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        clientX: 42,
        clientY: 16,
      })
    )
  );
  act(() => vi.runAllTimers());
  return host.querySelector<HTMLDivElement>("[contenteditable]")!;
}

it("进入编辑时光标落在点击位置且不全选", () => {
  caretRangeFromPoint.mockImplementation(() => {
    const range = document.createRange();
    range.setStart(host.querySelector("[contenteditable]")!.firstChild!, 2);
    range.collapse(true);
    return range;
  });
  const editor = startEditing();
  const selection = window.getSelection()!;
  expect(caretRangeFromPoint).toHaveBeenCalledWith(42, 16);
  expect(selection.anchorNode).toBe(editor.firstChild);
  expect(selection.anchorOffset).toBe(2);
  expect(selection.isCollapsed).toBe(true);
});

it("点击空白边缘时回退到文本末尾而不全选", () => {
  caretRangeFromPoint.mockReturnValue(null);
  const editor = startEditing();
  const selection = window.getSelection()!;
  expect(selection.isCollapsed).toBe(true);
  expect(selection.anchorNode).toBe(editor);
  expect(selection.anchorOffset).toBe(editor.childNodes.length);
});

it("编辑中再次点击保留草稿与当前光标", () => {
  caretRangeFromPoint.mockReturnValue(null);
  const editor = startEditing();
  editor.textContent = "尚未保存的标签";
  const range = document.createRange();
  range.setStart(editor.firstChild!, 3);
  range.collapse(true);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  act(() => editor.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  act(() => vi.runAllTimers());
  expect(editor.textContent).toBe("尚未保存的标签");
  expect(selection.anchorOffset).toBe(3);
  expect(selection.isCollapsed).toBe(true);
  expect(caretRangeFromPoint).toHaveBeenCalledTimes(1);
});
