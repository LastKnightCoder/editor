import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import ShikiOverlayEditor, { type OverlayKeydownHelpers } from "./ShikiOverlayEditor";

vi.mock("../../utils/shikiHighlighter", () => ({
  renderCodeWithShiki: vi.fn(async (code: string) => code),
  resolveShikiLanguage: vi.fn((language: string) => language),
}));

const setNativeTextareaValue = (textarea: HTMLTextAreaElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(textarea, value);
};

const mockHorizontalScrollMetrics = (
  element: HTMLElement,
  metrics: { clientWidth?: number; scrollWidth?: number }
) => {
  Object.defineProperties(element, {
    clientWidth: {
      configurable: true,
      value: metrics.clientWidth ?? 100,
    },
    scrollWidth: {
      configurable: true,
      value: metrics.scrollWidth ?? 500,
    },
  });
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
    props: Partial<React.ComponentProps<typeof ShikiOverlayEditor>> = {}
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
        />
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
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "(", bubbles: true }));
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

  it("按住 Ctrl 滚动时将 textarea 的纵向滚轮转换为横向滚动", async () => {
    const textarea = await renderEditor("const value = 1;");
    const codeLayer = container?.querySelector(".code-block-shiki-layer") as HTMLDivElement;
    mockHorizontalScrollMetrics(textarea, {
      clientWidth: 100,
      scrollWidth: 500,
    });
    mockHorizontalScrollMetrics(codeLayer, {
      clientWidth: 100,
      scrollWidth: 500,
    });

    await act(async () => {
      textarea.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          deltaY: 48,
        })
      );
    });

    expect(textarea.scrollLeft).toBe(48);
    expect(codeLayer.scrollLeft).toBe(48);
  });

  it("只读模式下按住 Command 滚动高亮层时同步横向滚动位置", async () => {
    const textarea = await renderEditor("const value = 1;", {
      readOnly: true,
    });
    const codeLayer = container?.querySelector(".code-block-shiki-layer") as HTMLDivElement;
    mockHorizontalScrollMetrics(textarea, {
      clientWidth: 100,
      scrollWidth: 500,
    });
    mockHorizontalScrollMetrics(codeLayer, {
      clientWidth: 100,
      scrollWidth: 500,
    });
    codeLayer.scrollLeft = 20;

    await act(async () => {
      codeLayer.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          metaKey: true,
          deltaY: 64,
        })
      );
    });

    expect(codeLayer.scrollLeft).toBe(84);
    expect(textarea.scrollLeft).toBe(84);
  });

  it("行号栏按逻辑行渲染，高亮行着色，点击回调 1 起的行号", async () => {
    const onLineNumberClick = vi.fn();
    await renderEditor("a\nb\nc", { lineNumbers: true, highlightLines: "2", onLineNumberClick });

    const numbers = Array.from(
      container!.querySelectorAll<HTMLElement>(".code-block-shiki-line-number")
    );
    expect(numbers.map(node => node.textContent)).toEqual(["1", "2", "3"]);
    expect(numbers[1].classList.contains("is-highlighted")).toBe(true);
    expect(numbers[0].classList.contains("is-highlighted")).toBe(false);

    await act(async () => {
      numbers[2].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onLineNumberClick).toHaveBeenCalledWith(3, expect.anything());
  });

  it("只读时行号不可点击，关闭行号时不渲染行号栏", async () => {
    const onLineNumberClick = vi.fn();
    await renderEditor("a\nb", { lineNumbers: true, readOnly: true, onLineNumberClick });
    const first = container!.querySelector<HTMLElement>(".code-block-shiki-line-number")!;
    expect(first.classList.contains("is-clickable")).toBe(false);
    await act(async () => {
      first.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onLineNumberClick).not.toHaveBeenCalled();

    await renderEditor("a\nb", { lineNumbers: false });
    expect(container!.querySelector(".code-block-shiki-gutter")).toBeNull();
  });

  it("自动换行时 textarea 软换行且取消横向滚动", async () => {
    const textarea = await renderEditor("const a = 1;", { wrap: true });
    expect(textarea.getAttribute("wrap")).toBe("soft");
    expect(textarea.style.overflowX).toBe("hidden");
    expect(container!.firstElementChild?.hasAttribute("data-wrap")).toBe(true);

    const unwrapped = await renderEditor("const a = 1;", { wrap: false });
    expect(unwrapped.getAttribute("wrap")).toBe("off");
  });

  it("改动行标记只给传入的行渲染", async () => {
    await renderEditor("a\nb\nc", {
      changedLines: new Set([0, 2]),
      changedLinesVisible: true,
    });
    expect(container!.querySelectorAll(".code-block-shiki-changed-line")).toHaveLength(2);
    expect(container!.querySelector(".code-block-shiki-deco")?.hasAttribute("data-visible")).toBe(
      true
    );
  });
});
