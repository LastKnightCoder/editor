import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { insertCodeText } from "../codeBlockInput";
import {
  getSourceSymbolKeys,
  insertIntoTextControl,
  insertSourceText,
  MATH_SYMBOL_KEYS,
  MERMAID_SYMBOL_KEYS,
} from "../sourceEditorInput";

type Position = { line: number; ch: number };

/** 单行文档的假 CodeMirror 实例：位置与下标一一对应 */
function createFakeCodeMirror(options: { from?: number; readOnly?: boolean } = {}) {
  const toPos = (index: number): Position => ({ line: 0, ch: index });
  return {
    replaceSelection: vi.fn(),
    getCursor: vi.fn(() => toPos(options.from ?? 3)),
    indexFromPos: vi.fn((position: Position) => position.ch),
    posFromIndex: vi.fn(toPos),
    setCursor: vi.fn(),
    focus: vi.fn(),
    getOption: vi.fn(() => options.readOnly ?? false),
  };
}

function createHost(cm: unknown): HTMLElement {
  const host = document.createElement("div");
  host.className = "ed-preview-codemirror";
  const wrapper = document.createElement("div");
  wrapper.className = "CodeMirror";
  (wrapper as unknown as { CodeMirror: unknown }).CodeMirror = cm;
  host.appendChild(wrapper);
  return host;
}

describe("insertSourceText（CodeMirror 5）", () => {
  it("替换选区并回焦，未给偏移时不移动光标", () => {
    const cm = createFakeCodeMirror();
    insertSourceText(createHost(cm), "\\alpha");
    expect(cm.replaceSelection).toHaveBeenCalledWith("\\alpha");
    expect(cm.setCursor).not.toHaveBeenCalled();
    expect(cm.focus).toHaveBeenCalled();
  });

  it("按插入起点 + cursorOffset 设置光标", () => {
    const cm = createFakeCodeMirror({ from: 3 });
    insertSourceText(createHost(cm), "\\frac{}{}", { cursorOffset: 6 });
    expect(cm.getCursor).toHaveBeenCalledWith("from");
    expect(cm.replaceSelection).toHaveBeenCalledWith("\\frac{}{}");
    expect(cm.posFromIndex).toHaveBeenCalledWith(9);
    expect(cm.setCursor).toHaveBeenCalledWith({ line: 0, ch: 9 });
    // 光标设置在回焦之前
    expect(cm.setCursor.mock.invocationCallOrder[0]).toBeLessThan(
      cm.focus.mock.invocationCallOrder[0]
    );
  });

  it("找不到实例或只读时不插入", () => {
    expect(() => insertSourceText(document.createElement("div"), "x")).not.toThrow();
    const cm = createFakeCodeMirror({ readOnly: true });
    insertSourceText(createHost(cm), "x");
    expect(cm.replaceSelection).not.toHaveBeenCalled();
  });
});

describe("insertIntoTextControl", () => {
  let root: Root | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = "";
  });

  /** 受控 input / textarea，onChange 记录最新值 */
  function renderControl(tag: "input" | "textarea", initial: string) {
    const values: string[] = [];
    function Control() {
      const [value, setValue] = useState(initial);
      const onChange = (event: { target: { value: string } }) => {
        values.push(event.target.value);
        setValue(event.target.value);
      };
      return tag === "input" ? (
        <input value={value} onChange={onChange} />
      ) : (
        <textarea value={value} onChange={onChange} />
      );
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root?.render(<Control />));
    const control = container.querySelector(tag) as HTMLInputElement | HTMLTextAreaElement;
    return { control, values };
  }

  for (const tag of ["input", "textarea"] as const) {
    it(`${tag}：替换选区，光标落在插入文本之后，经 onChange 更新`, () => {
      const { control, values } = renderControl(tag, "a+b");
      control.setSelectionRange(1, 2);
      act(() => insertIntoTextControl(control, "^"));
      expect(values).toEqual(["a^b"]);
      expect(control.value).toBe("a^b");
      expect(control.selectionStart).toBe(2);
      expect(control.selectionEnd).toBe(2);
    });

    it(`${tag}：cursorOffset 相对插入起点`, () => {
      const { control } = renderControl(tag, "x=");
      control.setSelectionRange(2, 2);
      act(() => insertIntoTextControl(control, "\\sqrt{}", 6));
      expect(control.value).toBe("x=\\sqrt{}");
      expect(control.selectionStart).toBe(8);
    });

    it(`${tag}：只读或禁用时不插入`, () => {
      const { control, values } = renderControl(tag, "ab");
      control.readOnly = true;
      act(() => insertIntoTextControl(control, "x"));
      control.readOnly = false;
      control.disabled = true;
      act(() => insertIntoTextControl(control, "x"));
      expect(values).toEqual([]);
      expect(control.value).toBe("ab");
    });
  }

  it("insertCodeText 复用同一实现", () => {
    const { control, values } = renderControl("textarea", "ab");
    control.setSelectionRange(1, 1);
    act(() => insertCodeText(control as HTMLTextAreaElement, "=>"));
    expect(values).toEqual(["a=>b"]);
    expect(control.selectionStart).toBe(3);
  });
});

describe("源码符号键", () => {
  it("公式与流程图各自的键集合", () => {
    expect(getSourceSymbolKeys("block-math")).toBe(MATH_SYMBOL_KEYS);
    expect(getSourceSymbolKeys("inline-math")).toBe(MATH_SYMBOL_KEYS);
    expect(getSourceSymbolKeys("mermaid")).toBe(MERMAID_SYMBOL_KEYS);
  });

  it("模板键的光标偏移落在第一个括号内", () => {
    const byLabel = (label: string) => MATH_SYMBOL_KEYS.find(key => key.label === label);
    expect(byLabel("{ }")).toMatchObject({ text: "{}", cursorOffset: 1 });
    expect(byLabel("( )")).toMatchObject({ text: "()", cursorOffset: 1 });
    expect(byLabel("\\frac")).toMatchObject({ text: "\\frac{}{}", cursorOffset: 6 });
    expect(byLabel("\\sqrt")).toMatchObject({ text: "\\sqrt{}", cursorOffset: 6 });
    expect(MERMAID_SYMBOL_KEYS.at(-1)).toEqual({
      label: "↵",
      text: "\n    ",
      ariaLabel: "换行缩进",
    });
  });
});
