import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useKeyboardAutoReveal } from "../useKeyboardAutoReveal";

function HookProbe() {
  useKeyboardAutoReveal();
  return null;
}

async function flushTimers(): Promise<void> {
  await act(async () => {
    vi.runAllTimers();
    await Promise.resolve();
  });
}

function createEditableDiv(): HTMLDivElement {
  const editor = document.createElement("div");
  editor.contentEditable = "true";
  editor.setAttribute("contenteditable", "true");
  editor.tabIndex = 0;
  document.body.appendChild(editor);
  return editor;
}

describe("useKeyboardAutoReveal", () => {
  let host: HTMLDivElement;
  let root: Root;
  let scrollIntoViewSpy: ReturnType<typeof vi.fn>;
  let scrollBySpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      return window.setTimeout(() => {
        callback(performance.now());
      }, 0);
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      window.clearTimeout(id);
    });
    scrollBySpy = vi.fn();
    Object.defineProperty(window, "scrollBy", {
      configurable: true,
      value: scrollBySpy,
    });
    scrollIntoViewSpy = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewSpy,
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root.render(<HookProbe />);
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("focus input 元素时应触发 reveal", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);

    await act(async () => {
      input.focus();
      input.dispatchEvent(new Event("focusin", { bubbles: true }));
    });
    await flushTimers();

    expect(scrollIntoViewSpy).toHaveBeenCalled();
  });

  it("位于 kb optout 区域的元素不应触发 reveal", async () => {
    const container = document.createElement("section");
    container.setAttribute("data-kb-optout", "true");
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.setAttribute("contenteditable", "true");
    editor.tabIndex = 0;
    container.appendChild(editor);
    document.body.appendChild(container);

    await act(async () => {
      editor.focus();
      editor.dispatchEvent(new Event("focusin", { bubbles: true }));
    });
    await flushTimers();

    expect(scrollIntoViewSpy).not.toHaveBeenCalled();
  });

  it("键盘高度事件触发后应对已聚焦 input 执行二次 reveal", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);

    await act(async () => {
      input.focus();
      input.dispatchEvent(new Event("focusin", { bubbles: true }));
    });
    await flushTimers();
    scrollIntoViewSpy.mockClear();

    await act(async () => {
      window.dispatchEvent(new CustomEvent("tau:native-kb-height"));
    });
    await flushTimers();

    expect(scrollIntoViewSpy).toHaveBeenCalled();
  });

  it("contenteditable 容器很大时应按光标定位且不应误滚到底部", async () => {
    const editor = createEditableDiv();
    const textNode = document.createTextNode("hello keyboard");
    editor.appendChild(textNode);
    Object.defineProperty(editor, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        width: 360,
        height: 2000,
        right: 360,
        bottom: 2000,
        toJSON: () => ({}),
      }),
    });

    const range = document.createRange();
    range.setStart(textNode, textNode.length);
    range.collapse(true);
    Object.defineProperty(range, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 140,
        y: 120,
        top: 120,
        left: 140,
        width: 2,
        height: 18,
        right: 142,
        bottom: 138,
        toJSON: () => ({}),
      }),
    });
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    await act(async () => {
      editor.focus();
      editor.dispatchEvent(new Event("focusin", { bubbles: true }));
    });
    await flushTimers();

    expect(scrollIntoViewSpy).not.toHaveBeenCalled();
    expect(scrollBySpy).not.toHaveBeenCalled();
  });
});
