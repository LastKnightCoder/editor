import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GlobalFindBar from ".";
import { type FindSource, useFindOwner, useFindSource } from "./findOwner";

function FindOwner({ open, active = true }: { open: () => void; active?: boolean }) {
  useFindOwner(open, active);
  return null;
}

function ModelFindSource({ source }: { source: FindSource }) {
  useFindSource(source);
  return null;
}

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

  it("有区域接管查找时 Ctrl+F 交给最后注册的接管者，接管者撤销后回到页内查找", () => {
    const ownerRoot = createRoot(document.createElement("div"));
    const page = vi.fn();
    const dialog = vi.fn();
    act(() =>
      ownerRoot.render(
        <>
          <FindOwner open={page} />
          <FindOwner open={dialog} />
        </>
      )
    );
    const query = () => document.body.querySelector('input[aria-label="搜索当前窗口"]');

    act(openFindBar);
    expect(dialog).toHaveBeenCalledTimes(1);
    expect(page).not.toHaveBeenCalled();
    expect(query()).toBeNull();

    act(() =>
      ownerRoot.render(
        <>
          <FindOwner open={page} />
          <FindOwner open={dialog} active={false} />
        </>
      )
    );
    act(openFindBar);
    expect(page).toHaveBeenCalledTimes(1);

    act(() => ownerRoot.unmount());
    act(openFindBar);
    expect(query()).not.toBeNull();
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

  it("全文源只在查找期间响应内容变更，DOM 挂载不会触发重新匹配", async () => {
    vi.useFakeTimers();
    let changed: (() => void) | undefined;
    const release = vi.fn();
    const reveal = vi.fn(() => release);
    const subscribe = vi.fn((listener: () => void) => {
      changed = listener;
      return () => {
        changed = undefined;
      };
    });
    const search = vi.fn(() => ({ count: 3, reveal }));
    try {
      act(() =>
        root.render(
          <>
            <GlobalFindBar />
            <ModelFindSource source={{ search, subscribe }} />
          </>
        )
      );
      expect(search).not.toHaveBeenCalled();
      expect(subscribe).not.toHaveBeenCalled();
      act(openFindBar);
      const input = document.body.querySelector<HTMLInputElement>(
        'input[aria-label="搜索当前窗口"]'
      );
      if (!input) throw new Error("未打开查找栏");
      act(() => setInputValue(input, "主世界"));
      await act(async () => vi.advanceTimersByTimeAsync(32));
      expect(document.body.textContent).toContain("1 / 3");
      expect(search).toHaveBeenCalledTimes(1);
      expect(reveal).toHaveBeenLastCalledWith(0, true);

      await act(async () => {
        container.appendChild(document.createElement("p")).textContent = "屏幕刚挂载的主世界";
        await vi.advanceTimersByTimeAsync(250);
      });
      expect(search).toHaveBeenCalledTimes(1);
      await act(async () => {
        changed?.();
        changed?.();
        await vi.advanceTimersByTimeAsync(250);
      });
      expect(search).toHaveBeenCalledTimes(2);
      expect(reveal).toHaveBeenLastCalledWith(0, false);
      act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
      expect(changed).toBeUndefined();
      expect(release).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
