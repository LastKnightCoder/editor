import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { insertCodeText } from "../codeBlockInput";
import { insertIntoTextControl, MATH_SYMBOL_KEYS } from "../sourceEditorInput";

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

describe("公式符号键", () => {
  it("模板键的光标偏移落在第一个括号内", () => {
    const byLabel = (label: string) => MATH_SYMBOL_KEYS.find(key => key.label === label);
    expect(byLabel("{ }")).toMatchObject({ text: "{}", cursorOffset: 1 });
    expect(byLabel("( )")).toMatchObject({ text: "()", cursorOffset: 1 });
    expect(byLabel("\\frac")).toMatchObject({ text: "\\frac{}{}", cursorOffset: 6 });
    expect(byLabel("\\sqrt")).toMatchObject({ text: "\\sqrt{}", cursorOffset: 6 });
  });
});
