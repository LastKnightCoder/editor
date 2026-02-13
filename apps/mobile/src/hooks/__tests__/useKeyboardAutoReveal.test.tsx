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
    Object.defineProperty(window, "scrollBy", {
      configurable: true,
      value: vi.fn(),
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

  it("focus contenteditable 元素时应触发 reveal", async () => {
    const editor = createEditableDiv();

    await act(async () => {
      editor.focus();
      editor.dispatchEvent(new Event("focusin", { bubbles: true }));
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

  it("键盘高度事件触发后应对已聚焦元素执行二次 reveal", async () => {
    const editor = createEditableDiv();

    await act(async () => {
      editor.focus();
      editor.dispatchEvent(new Event("focusin", { bubbles: true }));
    });
    await flushTimers();
    scrollIntoViewSpy.mockClear();

    await act(async () => {
      window.dispatchEvent(new CustomEvent("tau:native-kb-height"));
    });
    await flushTimers();

    expect(scrollIntoViewSpy).toHaveBeenCalled();
  });
});
