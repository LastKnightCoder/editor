import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createEditor, Editor, Transforms, type Descendant } from "slate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ColorPanel from "../ColorPanel";
import {
  EMPTY_COLOR_VALUE,
  applyColorValue,
  clearColors,
  readColorValue,
  readLastColor,
  setHighlight,
  setTextColor,
  setTextGradient,
  writeLastColor,
} from "../colorMarks";
import { INLINE_PALETTE } from "../../../../../constants";

const makeEditor = (leaf: Record<string, unknown> = {}) => {
  const editor = createEditor();
  editor.children = [
    { type: "paragraph", children: [{ type: "formatted", text: "文字", ...leaf }] },
  ] as unknown as Descendant[];
  Transforms.select(editor, { path: [0, 0], offset: 0 });
  Transforms.select(editor, Editor.range(editor, [0]));
  return editor;
};

const red = INLINE_PALETTE.find(entry => entry.id === "red")!;

describe("colorMarks", () => {
  beforeEach(() => localStorage.clear());

  it("字色按色板写入明暗两档，并能反查回色相", () => {
    const editor = makeEditor();
    setTextColor(editor, "red");
    const marks = Editor.marks(editor) as Record<string, unknown>;
    expect(marks.color).toBe(red.light);
    expect(marks.darkColor).toBe(red.dark);
    expect(readColorValue(editor).text).toBe("red");
  });

  it("字色与渐变互斥，高亮独立", () => {
    const editor = makeEditor();
    setTextColor(editor, "blue");
    setHighlight(editor, "green");
    setTextGradient(editor, "ocean");
    expect(readColorValue(editor)).toEqual({ text: null, gradient: "ocean", highlight: "green" });
  });

  it("历史字色记为 custom，早期 highlight=true 按黄色读", () => {
    const editor = makeEditor({ color: "#123456", highlight: true });
    expect(readColorValue(editor)).toEqual({ text: "custom", gradient: null, highlight: "yellow" });
  });

  it("清除颜色去掉字色、渐变与高亮", () => {
    const editor = makeEditor({ textGradient: "sunset", highlight: "red" });
    clearColors(editor);
    expect(readColorValue(editor)).toEqual(EMPTY_COLOR_VALUE);
  });

  it("一键套用最近组合", () => {
    const editor = makeEditor();
    applyColorValue(editor, { text: "purple", gradient: null, highlight: "yellow" });
    expect(readColorValue(editor)).toEqual({ text: "purple", gradient: null, highlight: "yellow" });
  });

  it("最近组合缺省为黄色高亮，存储损坏时回退", () => {
    expect(readLastColor()).toEqual({ text: null, gradient: null, highlight: "yellow" });
    writeLastColor({ text: "green", gradient: null, highlight: null });
    expect(readLastColor().text).toBe("green");
    localStorage.setItem("editor-last-inline-color", "{oops");
    expect(readLastColor().highlight).toBe("yellow");
  });
});

describe("ColorPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("文字与高亮两行都覆盖整套色板，当前值标为按下", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await act(async () => {
      root.render(
        <ColorPanel
          value={{ text: "red", gradient: null, highlight: "yellow" }}
          onTextColor={() => undefined}
          onGradient={() => undefined}
          onHighlight={() => undefined}
          onClear={() => undefined}
        />
      );
    });
    const pressed = [...container.querySelectorAll('[aria-pressed="true"]')].map(el =>
      el.getAttribute("aria-label")
    );
    expect(pressed).toEqual(["红色", "黄色高亮"]);
    // 默认 + 7 色、无高亮 + 7 色
    expect(container.querySelectorAll('[aria-label$="高亮"]').length).toBe(
      INLINE_PALETTE.length + 1
    );
    expect(errorSpy.mock.calls.flat().join("\n")).not.toContain('unique "key"');
  });
});
