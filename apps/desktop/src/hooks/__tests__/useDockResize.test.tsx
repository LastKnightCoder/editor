import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DOCK_CHAT_MAX, DOCK_CHAT_MIN, clampDockChatWidth, useDockResize } from "../useDockResize";

describe("clampDockChatWidth", () => {
  it("夹在停靠对话栏宽度上下限之间", () => {
    expect(clampDockChatWidth(100)).toBe(DOCK_CHAT_MIN);
    expect(clampDockChatWidth(5000)).toBe(DOCK_CHAT_MAX);
    expect(clampDockChatWidth(560)).toBe(560);
  });
});

describe("useDockResize", () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("向左拖动加宽、松手后停止跟随", () => {
    const setWidth = vi.fn();
    let start: ReturnType<typeof useDockResize> | undefined;
    function Harness() {
      start = useDockResize(500, setWidth);
      return null;
    }
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => root.render(<Harness />));
    cleanup = () => act(() => root.unmount());

    start!({ preventDefault: vi.fn(), clientX: 800 } as unknown as React.PointerEvent<HTMLElement>);
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 740 }));
    expect(setWidth).toHaveBeenLastCalledWith(560);

    // 超出上限按上限落
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 100 }));
    expect(setWidth).toHaveBeenLastCalledWith(DOCK_CHAT_MAX);

    window.dispatchEvent(new MouseEvent("pointerup"));
    setWidth.mockClear();
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 700 }));
    expect(setWidth).not.toHaveBeenCalled();
  });
});
