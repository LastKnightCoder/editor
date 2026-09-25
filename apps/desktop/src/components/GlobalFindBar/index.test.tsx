import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import GlobalFindBar from ".";

const setInputValue = (input: HTMLInputElement, value: string) => {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

const openFindBar = () => {
  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "f",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
  );
};

describe("GlobalFindBar", () => {
  let container: HTMLDivElement;
  let root: Root;
  let highlights: Map<string, unknown>;

  beforeEach(() => {
    highlights = new Map();
    Object.defineProperty(window, "CSS", {
      configurable: true,
      value: { highlights },
    });
    (window as any).Highlight = class Highlight {
      ranges: Range[];
      constructor(...ranges: Range[]) {
        this.ranges = ranges;
      }
    };
    container = document.createElement("div");
    container.innerHTML = "<p>第一个世界，主世界设置。</p><p>这里再次出现主世界。</p>";
    document.body.appendChild(container);
    const appContainer = document.createElement("div");
    document.body.appendChild(appContainer);
    root = createRoot(appContainer);
    act(() => root.render(<GlobalFindBar />));
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
  });

  it("通过 Ctrl+F 搜索当前窗口内多个编辑器的文本并高亮", async () => {
    act(openFindBar);
    const input = document.body.querySelector<HTMLInputElement>('input[aria-label="搜索当前窗口"]');
    expect(input).not.toBeNull();

    act(() => setInputValue(input!, "主世界"));
    await act(async () => Promise.resolve());

    expect(document.body.textContent).toContain("1 / 2");
    expect(highlights.has("tau-global-find")).toBe(true);
    expect(highlights.has("tau-global-find-current")).toBe(true);
  });

  it("支持 Enter 与 Shift+Enter 在结果间循环", async () => {
    act(openFindBar);
    const input = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="搜索当前窗口"]'
    )!;
    act(() => setInputValue(input, "主世界"));
    await act(async () => Promise.resolve());

    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(document.body.textContent).toContain("2 / 2");

    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          shiftKey: true,
          bubbles: true,
        })
      );
    });
    expect(document.body.textContent).toContain("1 / 2");
  });

  it("按 Escape 关闭搜索栏并清除高亮", () => {
    act(openFindBar);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(document.body.querySelector('input[aria-label="搜索当前窗口"]')).toBeNull();
    expect(highlights.size).toBe(0);
  });
});
