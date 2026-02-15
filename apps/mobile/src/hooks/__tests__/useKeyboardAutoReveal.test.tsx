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

  it("contenteditable selectionchange 时应推动最近滚动容器滚动", async () => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 700,
    });
    const scrollContainer = document.createElement("section");
    scrollContainer.style.overflowY = "auto";
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      value: 220,
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      value: 1400,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      writable: true,
      value: 0,
    });
    document.body.appendChild(scrollContainer);

    const editor = createEditableDiv();
    scrollContainer.appendChild(editor);
    const textNode = document.createTextNode("selection auto reveal");
    editor.appendChild(textNode);

    const range = document.createRange();
    range.setStart(textNode, textNode.length);
    range.collapse(true);
    let caretTop = 120;
    let caretBottom = 138;
    Object.defineProperty(range, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 16,
        y: caretTop,
        top: caretTop,
        left: 16,
        width: 2,
        height: Math.max(1, caretBottom - caretTop),
        right: 18,
        bottom: caretBottom,
        toJSON: () => ({}),
      }),
    });
    vi.spyOn(window, "getSelection").mockReturnValue({
      rangeCount: 1,
      getRangeAt: () => range,
    } as unknown as Selection);

    await act(async () => {
      editor.focus();
      editor.dispatchEvent(new Event("focusin", { bubbles: true }));
    });
    await flushTimers();
    expect(scrollContainer.scrollTop).toBe(0);

    caretTop = 760;
    caretBottom = 778;

    await act(async () => {
      document.dispatchEvent(new Event("selectionchange"));
    });
    await flushTimers();

    expect(scrollContainer.scrollTop).toBeGreaterThan(0);
    expect(scrollIntoViewSpy).not.toHaveBeenCalled();
  });

  it("beforeinput 与 input 应在编辑中触发 reveal", async () => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 700,
    });
    const scrollContainer = document.createElement("section");
    scrollContainer.style.overflowY = "auto";
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      value: 220,
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      value: 1600,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      writable: true,
      value: 0,
    });
    document.body.appendChild(scrollContainer);

    const editor = createEditableDiv();
    scrollContainer.appendChild(editor);
    const textNode = document.createTextNode("line-1");
    editor.appendChild(textNode);

    const range = document.createRange();
    range.setStart(textNode, textNode.length);
    range.collapse(true);
    let caretTop = 100;
    let caretBottom = 118;
    Object.defineProperty(range, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 24,
        y: caretTop,
        top: caretTop,
        left: 24,
        width: 2,
        height: Math.max(1, caretBottom - caretTop),
        right: 26,
        bottom: caretBottom,
        toJSON: () => ({}),
      }),
    });
    vi.spyOn(window, "getSelection").mockReturnValue({
      rangeCount: 1,
      getRangeAt: () => range,
    } as unknown as Selection);

    await act(async () => {
      editor.focus();
      editor.dispatchEvent(new Event("focusin", { bubbles: true }));
    });
    await flushTimers();
    expect(scrollContainer.scrollTop).toBe(0);

    caretTop = 770;
    caretBottom = 788;

    await act(async () => {
      editor.dispatchEvent(new Event("beforeinput", { bubbles: true }));
    });
    await flushTimers();
    expect(scrollContainer.scrollTop).toBeGreaterThan(0);

    scrollContainer.scrollTop = 0;

    await act(async () => {
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flushTimers();
    expect(scrollContainer.scrollTop).toBeGreaterThan(0);
  });

  it("无有效编辑焦点时 selectionchange 不应触发 reveal", async () => {
    const textNode = document.createTextNode("plain text selection");
    document.body.appendChild(textNode);

    const range = document.createRange();
    range.setStart(textNode, textNode.length);
    range.collapse(true);
    Object.defineProperty(range, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 12,
        y: 780,
        top: 780,
        left: 12,
        width: 2,
        height: 18,
        right: 14,
        bottom: 798,
        toJSON: () => ({}),
      }),
    });
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    await act(async () => {
      document.dispatchEvent(new Event("selectionchange"));
    });
    await flushTimers();

    expect(scrollIntoViewSpy).not.toHaveBeenCalled();
    expect(scrollBySpy).not.toHaveBeenCalled();
  });

  it("存在底部编辑器工具栏遮挡时应将光标推到工具栏上方", async () => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 800,
    });
    document.documentElement.style.setProperty("--kb-height", "0px");

    const toolbar = document.createElement("nav");
    toolbar.setAttribute("data-mobile-editor-toolbar", "true");
    Object.defineProperty(toolbar, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 520,
        top: 520,
        left: 0,
        width: 390,
        height: 84,
        right: 390,
        bottom: 604,
        toJSON: () => ({}),
      }),
    });
    document.body.appendChild(toolbar);

    const scrollContainer = document.createElement("section");
    scrollContainer.style.overflowY = "auto";
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      value: 220,
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      value: 1600,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      writable: true,
      value: 0,
    });
    document.body.appendChild(scrollContainer);

    const editor = createEditableDiv();
    scrollContainer.appendChild(editor);
    const textNode = document.createTextNode("toolbar occlusion");
    editor.appendChild(textNode);

    const range = document.createRange();
    range.setStart(textNode, textNode.length);
    range.collapse(true);
    Object.defineProperty(range, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 24,
        y: 560,
        top: 560,
        left: 24,
        width: 2,
        height: 18,
        right: 26,
        bottom: 578,
        toJSON: () => ({}),
      }),
    });
    vi.spyOn(window, "getSelection").mockReturnValue({
      rangeCount: 1,
      getRangeAt: () => range,
    } as unknown as Selection);

    await act(async () => {
      editor.focus();
      editor.dispatchEvent(new Event("focusin", { bubbles: true }));
    });
    await flushTimers();

    expect(scrollContainer.scrollTop).toBeGreaterThan(0);
    expect(scrollIntoViewSpy).not.toHaveBeenCalled();
  });

  it("回车进入空行且 range 矩形无效时仍应回退容器定位并滚动到可视区", async () => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 700,
    });

    const scrollContainer = document.createElement("section");
    scrollContainer.style.overflowY = "auto";
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      value: 220,
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      value: 1800,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      writable: true,
      value: 0,
    });
    document.body.appendChild(scrollContainer);

    const editor = createEditableDiv();
    scrollContainer.appendChild(editor);
    const line = document.createElement("span");
    const textNode = document.createTextNode("next line");
    line.appendChild(textNode);
    editor.appendChild(line);

    let atEmptyLine = false;
    Object.defineProperty(line, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 24,
        y: atEmptyLine ? 760 : 120,
        top: atEmptyLine ? 760 : 120,
        left: 24,
        width: 120,
        height: 20,
        right: 144,
        bottom: atEmptyLine ? 780 : 140,
        toJSON: () => ({}),
      }),
    });

    const range = document.createRange();
    range.setStart(textNode, textNode.length);
    range.collapse(true);
    Object.defineProperty(range, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        right: 0,
        bottom: 0,
        toJSON: () => ({}),
      }),
    });
    Object.defineProperty(range, "getClientRects", {
      configurable: true,
      value: () => ({
        length: 0,
        item: () => null,
        [Symbol.iterator]: function* () {
          yield* [];
        },
      }),
    });
    vi.spyOn(window, "getSelection").mockReturnValue({
      rangeCount: 1,
      getRangeAt: () => range,
      focusNode: textNode,
      anchorNode: textNode,
    } as unknown as Selection);

    await act(async () => {
      editor.focus();
      editor.dispatchEvent(new Event("focusin", { bubbles: true }));
    });
    await flushTimers();
    expect(scrollContainer.scrollTop).toBe(0);

    atEmptyLine = true;

    await act(async () => {
      editor.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
        }),
      );
    });
    await flushTimers();

    expect(scrollContainer.scrollTop).toBeGreaterThan(0);
    expect(scrollIntoViewSpy).not.toHaveBeenCalled();
  });
});
