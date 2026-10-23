import { act, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorRef } from "@tau/editor";
import { createEditor, type Descendant, type Range } from "slate";
import { ReactEditor } from "slate-react";
import {
  READING_SELECTION_SETTLE_MS,
  useReadingSelection,
  type ReadingSelectionState,
} from "../useReadingSelection";

const SLATE_RANGE: Range = {
  anchor: { path: [0, 0], offset: 1 },
  focus: { path: [0, 0], offset: 4 },
};

function Probe(props: {
  editorRef: RefObject<EditorRef | null>;
  active: boolean;
  latest: { current: ReadingSelectionState | null };
}) {
  props.latest.current = useReadingSelection(props.editorRef, props.active);
  return null;
}

describe("useReadingSelection", () => {
  let host: HTMLDivElement;
  let root: Root;
  let editable: HTMLDivElement;
  let outside: HTMLParagraphElement;
  let toSlateRange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"],
    });
    editable = document.createElement("div");
    editable.innerHTML = "<p>hello world</p>";
    outside = document.createElement("p");
    outside.textContent = "outside";
    host = document.createElement("div");
    document.body.append(editable, outside, host);
    root = createRoot(host);
    toSlateRange = vi.fn(() => SLATE_RANGE);
    vi.spyOn(ReactEditor, "toSlateRange").mockImplementation(
      toSlateRange as unknown as typeof ReactEditor.toSlateRange
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    window.getSelection()?.removeAllRanges();
    document.body.innerHTML = "";
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function setup(active = true) {
    const editor = createEditor();
    editor.children = [
      { type: "paragraph", children: [{ type: "formatted", text: "hello world" }] },
    ] as unknown as Descendant[];
    const ref: RefObject<EditorRef | null> = {
      current: {
        focus: vi.fn(),
        deselect: vi.fn(),
        getEditor: () => editor,
        getEditableElement: () => editable,
        isFocus: () => false,
      },
    };
    const latest: { current: ReadingSelectionState | null } = { current: null };
    const render = (nextActive: boolean) => {
      act(() => root.render(<Probe editorRef={ref} active={nextActive} latest={latest} />));
    };
    render(active);
    return { latest, render };
  }

  function selectText(node: Node, start: number, end: number) {
    const selection = window.getSelection();
    if (!selection) throw new Error("无 Selection");
    const domRange = document.createRange();
    domRange.setStart(node, start);
    domRange.setEnd(node, end);
    selection.removeAllRanges();
    selection.addRange(domRange);
  }

  function fireSelectionChange() {
    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
      vi.advanceTimersToNextFrame();
    });
  }

  function advance(ms: number) {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  }

  const editableText = () => editable.querySelector("p")?.firstChild as Node;

  it("编辑器内展开选区稳定 150ms 后得到 range", () => {
    const { latest } = setup();
    selectText(editableText(), 1, 4);
    fireSelectionChange();
    expect(latest.current?.range).toBeNull();
    advance(READING_SELECTION_SETTLE_MS - 10);
    expect(latest.current?.range).toBeNull();
    advance(10);
    expect(latest.current?.range).toEqual(SLATE_RANGE);
    expect(toSlateRange).toHaveBeenCalledWith(
      expect.anything(),
      window.getSelection(),
      expect.objectContaining({ exactMatch: false, suppressThrow: true })
    );
  });

  it("选区持续变化时防抖，最后一次变化稳定后才更新", () => {
    const { latest } = setup();
    selectText(editableText(), 1, 2);
    fireSelectionChange();
    advance(100);
    selectText(editableText(), 1, 4);
    fireSelectionChange();
    advance(100);
    expect(latest.current?.range).toBeNull();
    advance(READING_SELECTION_SETTLE_MS);
    expect(latest.current?.range).toEqual(SLATE_RANGE);
  });

  it("折叠立即置空", () => {
    const { latest } = setup();
    selectText(editableText(), 1, 4);
    fireSelectionChange();
    advance(READING_SELECTION_SETTLE_MS);
    expect(latest.current?.range).not.toBeNull();
    selectText(editableText(), 2, 2);
    fireSelectionChange();
    expect(latest.current?.range).toBeNull();
  });

  it("选区在编辑器外或跨出编辑器时为 null", () => {
    const { latest } = setup();
    selectText(outside.firstChild as Node, 0, 3);
    fireSelectionChange();
    advance(READING_SELECTION_SETTLE_MS);
    expect(latest.current?.range).toBeNull();

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.setBaseAndExtent(editableText(), 1, outside.firstChild as Node, 2);
    fireSelectionChange();
    advance(READING_SELECTION_SETTLE_MS);
    expect(latest.current?.range).toBeNull();
    expect(toSlateRange).not.toHaveBeenCalled();
  });

  it("换算失败（suppressThrow 返回 null）时为 null", () => {
    toSlateRange.mockReturnValue(null);
    const { latest } = setup();
    selectText(editableText(), 1, 4);
    fireSelectionChange();
    advance(READING_SELECTION_SETTLE_MS);
    expect(latest.current?.range).toBeNull();
  });

  it("active=false 恒为 null 且不监听；切回 false 时清空", () => {
    const { latest, render } = setup(false);
    selectText(editableText(), 1, 4);
    fireSelectionChange();
    advance(READING_SELECTION_SETTLE_MS);
    expect(latest.current?.range).toBeNull();
    expect(toSlateRange).not.toHaveBeenCalled();

    render(true);
    fireSelectionChange();
    advance(READING_SELECTION_SETTLE_MS);
    expect(latest.current?.range).toEqual(SLATE_RANGE);
    render(false);
    expect(latest.current?.range).toBeNull();
  });

  it("clear 清空 DOM 选区并置空", () => {
    const { latest } = setup();
    selectText(editableText(), 1, 4);
    fireSelectionChange();
    advance(READING_SELECTION_SETTLE_MS);
    act(() => latest.current?.clear());
    expect(latest.current?.range).toBeNull();
    expect(window.getSelection()?.rangeCount).toBe(0);
  });
});
