import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useScrollState, type ScrollState } from "../hooks/useEdgeFade";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("固定高度内文字增删后更新可滚方向，不保留已经消失的溢出", async () => {
  // 白板适应高度可能不改变已有盒子尺寸，文字变化必须独立刷新滚动状态。
  vi.useFakeTimers();
  const container = document.createElement("div");
  const scroller = document.createElement("div");
  const text = document.createTextNode("正文");
  scroller.append(text);
  document.body.append(container, scroller);
  let contentHeight = 300;
  Object.defineProperties(scroller, {
    clientHeight: { value: 120 },
    scrollHeight: { get: () => contentHeight },
  });
  let state: ScrollState | undefined;
  function Host() {
    state = useScrollState(scroller);
    return null;
  }
  const root = createRoot(container);

  try {
    await act(async () => root.render(<Host />));
    expect(state).toEqual({ scrolled: false, canScrollDown: true });

    await act(async () => {
      contentHeight = 120;
      text.data = "缩短后的正文";
      await Promise.resolve();
      vi.runOnlyPendingTimers();
    });
    expect(state).toEqual({ scrolled: false, canScrollDown: false });

    await act(async () => {
      contentHeight = 300;
      text.data = "再次增长的正文";
      await Promise.resolve();
      vi.runOnlyPendingTimers();
    });
    expect(state).toEqual({ scrolled: false, canScrollDown: true });
  } finally {
    act(() => root.unmount());
    container.remove();
    scroller.remove();
    vi.useRealTimers();
  }
});
