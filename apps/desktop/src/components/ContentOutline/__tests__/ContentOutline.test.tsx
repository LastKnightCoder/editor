import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ContentOutline } from "..";

vi.mock("@/utils", () => ({ getInlineElementText: () => "" }));
afterEach(() => vi.unstubAllGlobals());

it("目录同步滚动高亮，触底选中短末节，上滚恢复判定且短文不误选末节", () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {
        /* 测试不启动实际观测。 */
      }
      disconnect() {
        /* 测试不启动实际观测。 */
      }
    }
  );
  let frame: FrameRequestCallback | undefined;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const scrollEl = document.createElement("div");
  scrollEl.scrollTo = vi.fn();
  scrollEl.scrollTop = 100;
  Object.defineProperty(scrollEl, "clientHeight", { value: 400 });
  let scrollHeight = 1000;
  Object.defineProperty(scrollEl, "scrollHeight", { get: () => scrollHeight });
  scrollEl.getBoundingClientRect = () => ({ top: 50 }) as DOMRect;
  const anchor = document.createElement("h2");
  let anchorTop = 350;
  anchor.getBoundingClientRect = () => ({ top: anchorTop, bottom: anchorTop + 30 }) as DOMRect;
  const lastAnchor = document.createElement("h2");
  let lastAnchorTop = 400;
  lastAnchor.getBoundingClientRect = () =>
    ({ top: lastAnchorTop, bottom: lastAnchorTop + 30 }) as DOMRect;
  try {
    act(() =>
      root.render(
        <ContentOutline
          headers={[
            { id: "section", level: 2, title: "章节" },
            { id: "last", level: 2, title: "短末节" },
          ]}
          scrollEl={scrollEl}
          resolveAnchor={(_header, index) => (index === 0 ? anchor : lastAnchor)}
        />
      )
    );
    const button = container.querySelector("button");
    if (!button) throw new Error("目录按钮未挂载");
    act(() => button.click());
    expect(scrollEl.scrollTo).toHaveBeenCalledWith({ top: 400, behavior: "smooth" });
    expect(button.className).toContain("bg-selected");
    act(() => {
      anchorTop = 100;
      scrollEl.dispatchEvent(new Event("scroll"));
      frame?.(0);
    });
    expect(button.className).toContain("bg-selected");
    const lastButton = container.querySelectorAll("button")[1];
    const scrollTo = (top: number) =>
      act(() => {
        scrollEl.scrollTop = top;
        scrollEl.dispatchEvent(new Event("scroll"));
        frame?.(0);
      });
    anchorTop = -50;
    scrollTo(300);
    expect(lastButton.className).toContain("bg-selected");
    expect(button.className).not.toContain("bg-selected");
    lastAnchorTop = 500;
    scrollTo(320);
    expect(button.className).toContain("bg-selected");
    expect(lastButton.className).not.toContain("bg-selected");
    anchorTop = 100;
    lastAnchorTop = 350;
    scrollTo(599.5);
    expect(lastButton.className).toContain("bg-selected");
    expect(button.className).not.toContain("bg-selected");
    scrollTo(590);
    expect(button.className).toContain("bg-selected");
    expect(lastButton.className).not.toContain("bg-selected");
    scrollHeight = 400;
    scrollTo(0);
    expect(button.className).toContain("bg-selected");
    expect(lastButton.className).not.toContain("bg-selected");
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

it("等价目录快照不重建测量订阅，滚动和正文更新只测相邻标题", () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {
        /* 测试不启动实际观测。 */
      }
      disconnect() {
        /* 测试不启动实际观测。 */
      }
    }
  );
  let frame: FrameRequestCallback | undefined;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const host = document.createElement("div");
  const root = createRoot(host);
  const scrollEl = document.createElement("div");
  scrollEl.scrollTop = 40_050;
  Object.defineProperty(scrollEl, "clientHeight", { value: 400 });
  Object.defineProperty(scrollEl, "scrollHeight", { value: 60_000 });
  scrollEl.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
  const headers = Array.from({ length: 500 }, (_, index) => ({
    id: `h-${index}`,
    level: 2,
    title: `章节${index}`,
  }));
  const read = vi.fn(
    (index: number) =>
      ({
        top: index * 100 - scrollEl.scrollTop,
        bottom: index * 100 + 30 - scrollEl.scrollTop,
      }) as DOMRect
  );
  const anchors = headers.map((_, index) => {
    const anchor = document.createElement("h2");
    anchor.getBoundingClientRect = () => read(index);
    return anchor;
  });
  const resolveAnchor = (_header: unknown, index: number) => anchors[index];
  try {
    act(() =>
      root.render(
        <ContentOutline headers={headers} scrollEl={scrollEl} resolveAnchor={resolveAnchor} />
      )
    );
    expect(read.mock.calls.length).toBeLessThanOrEqual(12);
    read.mockClear();
    act(() =>
      root.render(
        <ContentOutline
          headers={headers.map(header => ({ ...header }))}
          scrollEl={scrollEl}
          resolveAnchor={resolveAnchor}
        />
      )
    );
    expect(read).not.toHaveBeenCalled();
    act(() => frame?.(0));
    expect(read.mock.calls.length).toBeLessThanOrEqual(2);
  } finally {
    act(() => root.unmount());
  }
});

it("支持源码模式只提供矩形的虚拟标题锚点", () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {
        /* 测试不启动实际观测。 */
      }
      disconnect() {
        /* 测试不启动实际观测。 */
      }
    }
  );
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const host = document.createElement("div");
  const root = createRoot(host);
  const scrollEl = document.createElement("div");
  Object.defineProperty(scrollEl, "clientHeight", { value: 400 });
  Object.defineProperty(scrollEl, "scrollHeight", { value: 1000 });
  scrollEl.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
  const anchor = { getBoundingClientRect: () => ({ top: 100, bottom: 130 }) } as HTMLElement;
  try {
    act(() =>
      root.render(
        <ContentOutline
          headers={[{ id: "source-h-0", level: 2, title: "源码标题" }]}
          scrollEl={scrollEl}
          resolveAnchor={() => anchor}
        />
      )
    );
    expect(host.querySelector("button")?.className).toContain("bg-selected");
  } finally {
    act(() => root.unmount());
  }
});
