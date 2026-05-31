import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import ShikiOverlayEditor, {
  type OverlayKeydownHelpers,
} from "./ShikiOverlayEditor";

vi.mock("../../utils/shikiHighlighter", () => ({
  renderCodeWithShiki: vi.fn(async (code: string) => code),
  resolveShikiLanguage: vi.fn((language: string) => language),
}));

const setNativeTextareaValue = (
  textarea: HTMLTextAreaElement,
  value: string,
) => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  setter?.call(textarea, value);
};

describe("ShikiOverlayEditor selection", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    container?.remove();
    container = null;
    document.body.innerHTML = "";
  });

  const renderEditor = async (
    value: string,
    props: Partial<React.ComponentProps<typeof ShikiOverlayEditor>> = {},
  ) => {
    container = container ?? document.createElement("div");
    if (!container.isConnected) {
      document.body.appendChild(container);
    }
    root = root ?? createRoot(container);

    await act(async () => {
      root?.render(
        <ShikiOverlayEditor
          value={value}
          language="ts"
          isDark={false}
          onChange={() => {}}
          {...props}
        />,
      );
    });

    return container.querySelector("textarea") as HTMLTextAreaElement;
  };

  it("受控 value 重新渲染后保留输入位置，而不是跳到末尾", async () => {
    let value = "const value = 1;";
    const onChange = vi.fn((nextValue: string) => {
      value = nextValue;
    });
    const textarea = await renderEditor(value, { onChange });

    textarea.focus();
    textarea.setSelectionRange(6, 6);
    await act(async () => {
      setNativeTextareaValue(textarea, "const Xvalue = 1;");
      textarea.setSelectionRange(7, 7);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith("const Xvalue = 1;");

    await renderEditor(value, { onChange });

    expect(textarea.selectionStart).toBe(7);
    expect(textarea.selectionEnd).toBe(7);
  });

  it("键盘辅助设置 selection 后允许下一次 value 更新恢复光标", async () => {
    let value = "abc";
    let helpers: OverlayKeydownHelpers | null = null;
    const onChange = vi.fn((nextValue: string) => {
      value = nextValue;
    });
    const textarea = await renderEditor(value, {
      onChange,
      onKeyDown: (_event, nextHelpers) => {
        helpers = nextHelpers;
      },
    });

    textarea.focus();
    textarea.setSelectionRange(1, 1);
    await act(async () => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: "(", bubbles: true }),
      );
    });

    expect(helpers).not.toBeNull();
    await act(async () => {
      helpers!.setSelection(2, 2);
    });

    value = "a()bc";
    textarea.setSelectionRange(value.length, value.length);
    await renderEditor(value, { onChange });

    expect(textarea.selectionStart).toBe(2);
    expect(textarea.selectionEnd).toBe(2);
  });

  it("外部主动替换为不同 value 时不沿用旧 selection", async () => {
    const textarea = await renderEditor("abc");

    textarea.focus();
    textarea.setSelectionRange(1, 1);
    await act(async () => {
      textarea.dispatchEvent(new Event("select", { bubbles: true }));
    });

    textarea.setSelectionRange(4, 4);
    await renderEditor("wxyz");

    expect(textarea.selectionStart).toBe(4);
    expect(textarea.selectionEnd).toBe(4);
  });
});
