import { Activity, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import WhiteBoard from "../WhiteBoard";
import { useBoard } from "../hooks/useBoard";
import type Board from "../Board";
import { ownsBoardEvent, ownsBoardPointerEvent } from "../utils/events";
import { BOARD_TO_CONTAINER } from "../constants/map";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});
const observer = class {
  observe() {}
  disconnect() {}
  unobserve() {}
};

function dispatchPointer(target: HTMLElement, type: string, pointerId: number, button = 2, x = 10) {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX: x,
    clientY: 10,
    button,
    buttons: type === "pointerdown" || type === "pointermove" ? 2 : 0,
  });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  target.dispatchEvent(event);
}

describe("白板挂载与事件归属", () => {
  it("方向键移动中隐藏会结束计时器，隐藏后松键和恢复均不继续移动", async () => {
    vi.stubGlobal("ResizeObserver", observer);
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let board!: Board;
    function Capture() {
      board = useBoard();
      return null;
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const render = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <WhiteBoard
          initData={[]}
          showToolbar={false}
          showAttributeSetter={false}
          showStatusBar={false}
          slots={{ Layers: Capture }}
        />
      </Activity>
    );
    try {
      await act(async () => root.render(render("visible")));
      const canvas = container.querySelector<HTMLElement>("[data-whiteboard-root]")!;
      canvas.focus();
      act(() =>
        canvas.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }))
      );
      expect(board.interactions.activeKeyState).not.toBeNull();
      act(() => vi.advanceTimersByTime(120));
      const beforeHidden = board.viewPort.minX;
      await act(async () => root.render(render("hidden")));
      expect(board.isDestroyed).toBe(false);
      expect(board.interactions.activeKeyState).toBeNull();
      act(() => {
        document.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "ArrowRight" }));
        vi.advanceTimersByTime(180);
      });
      expect(board.viewPort.minX).toBe(beforeHidden);
      await act(async () => root.render(render("visible")));
      act(() => vi.advanceTimersByTime(180));
      expect(board.viewPort.minX).toBe(beforeHidden);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      await act(async () => root.unmount());
    }
  });

  it.each([
    ["pointerup", false],
    ["pointercancel", false],
    ["pointerup", true],
    ["pointercancel", true],
  ] as const)("跨实例 %s（控件拦截=%s）只结束发起实例的手势", async (ending, blocked) => {
    vi.stubGlobal("ResizeObserver", observer);
    const boards: Record<string, Board> = {};
    function First() {
      boards.a = useBoard();
      return null;
    }
    function Second() {
      boards.b = useBoard();
      return null;
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          <>
            <WhiteBoard
              initData={[]}
              showToolbar={false}
              showAttributeSetter={false}
              showStatusBar={false}
              slots={{ Layers: First }}
            />
            <WhiteBoard
              initData={[]}
              showToolbar={false}
              showAttributeSetter={false}
              showStatusBar={false}
              slots={{ Layers: Second }}
            />
          </>
        )
      );
      const [first, second] = container.querySelectorAll<HTMLElement>("[data-whiteboard-root]");
      if (blocked) second.addEventListener(ending, event => event.stopPropagation());
      const otherEnd = vi.spyOn(
        boards.b,
        ending === "pointerup" ? "onGlobalPointerUp" : "onGlobalPointerCancel"
      );
      await act(async () => {
        dispatchPointer(first, "pointerdown", 7);
      });
      expect(boards.a.interactions.activePointerState?.name).toBe("panning");
      await act(async () => {
        dispatchPointer(second, "pointermove", 7, 2, 40);
      });
      expect(boards.a.viewPort.minX).not.toBe(0);
      expect(boards.b.viewPort.minX).toBe(0);
      await act(async () => {
        dispatchPointer(second, ending, 7, 2, 40);
      });
      expect(boards.a.interactions.activePointerState).toBeNull();
      expect(otherEnd).not.toHaveBeenCalled();
      const stopped = boards.a.viewPort.minX;
      await act(async () => {
        dispatchPointer(first, "pointermove", 7, 0, 60);
      });
      expect(boards.a.viewPort.minX).toBe(stopped);
    } finally {
      await act(async () => root.unmount());
    }
  });

  it("不同 pointerId 的释放不会结束另一实例的手势", async () => {
    vi.stubGlobal("ResizeObserver", observer);
    const boards: Record<string, Board> = {};
    function First() {
      boards.a = useBoard();
      return null;
    }
    function Second() {
      boards.b = useBoard();
      return null;
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          <>
            <WhiteBoard
              initData={[]}
              showToolbar={false}
              showAttributeSetter={false}
              showStatusBar={false}
              slots={{ Layers: First }}
            />
            <WhiteBoard
              initData={[]}
              showToolbar={false}
              showAttributeSetter={false}
              showStatusBar={false}
              slots={{ Layers: Second }}
            />
          </>
        )
      );
      const [first, second] = container.querySelectorAll<HTMLElement>("[data-whiteboard-root]");
      await act(async () => {
        dispatchPointer(first, "pointerdown", 7);
        dispatchPointer(second, "pointerdown", 8);
      });
      await act(async () => {
        dispatchPointer(first, "pointerup", 99);
      });
      expect(boards.a.interactions.activePointerState?.name).toBe("panning");
      await act(async () => {
        dispatchPointer(second, "pointerup", 8);
      });
      expect(boards.a.interactions.activePointerState?.name).toBe("panning");
      expect(boards.b.interactions.activePointerState).toBeNull();
      await act(async () => {
        dispatchPointer(second, "pointerup", 7);
      });
      expect(boards.a.interactions.activePointerState).toBeNull();
    } finally {
      await act(async () => root.unmount());
    }
  });

  it("隐藏期间清除实例的指针归属", async () => {
    vi.stubGlobal("ResizeObserver", observer);
    let board!: Board;
    function Capture() {
      board = useBoard();
      return null;
    }
    const container = document.createElement("div");
    document.body.append(container);
    const outside = document.createElement("div");
    outside.dataset.whiteboardRoot = "";
    document.body.append(outside);
    const root = createRoot(container);
    const render = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <WhiteBoard
          initData={[]}
          showToolbar={false}
          showAttributeSetter={false}
          showStatusBar={false}
          slots={{ Layers: Capture }}
        />
      </Activity>
    );
    try {
      await act(async () => root.render(render("visible")));
      const canvas = container.querySelector<HTMLElement>("[data-whiteboard-root]")!;
      await act(async () => {
        dispatchPointer(canvas, "pointerdown", 7);
      });
      await act(async () => root.render(render("hidden")));
      let event!: PointerEvent;
      outside.addEventListener("pointermove", value => {
        event = value as PointerEvent;
      });
      dispatchPointer(outside, "pointermove", 7);
      expect(ownsBoardPointerEvent(board, event)).toBe(false);
      expect(board.interactions.activePointerState).toBeNull();
    } finally {
      await act(async () => root.unmount());
    }
  });
  it("Activity 隐藏再恢复保留 Board 和历史，真正卸载才销毁", async () => {
    vi.stubGlobal("ResizeObserver", observer);
    let board: Board | undefined;
    function Capture() {
      board = useBoard();
      return null;
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const render = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <WhiteBoard
          initData={[]}
          showToolbar={false}
          showAttributeSetter={false}
          showStatusBar={false}
          slots={{ Layers: Capture }}
        />
      </Activity>
    );
    await act(async () => root.render(render("visible")));
    const original = board!;
    original.undos.push([]);
    await act(async () => root.render(render("hidden")));
    expect(original.isDestroyed).toBe(false);
    await act(async () => root.render(render("visible")));
    expect(board).toBe(original);
    expect(board!.undos).toHaveLength(1);
    await act(async () => root.unmount());
    expect(original.isDestroyed).toBe(true);
  });

  it("嵌套白板事件只属于最内层实例", () => {
    const outer = document.createElement("div"),
      inner = document.createElement("div");
    outer.dataset.whiteboardRoot = "";
    inner.dataset.whiteboardRoot = "";
    outer.append(inner);
    document.body.append(outer);
    const first = { isDestroyed: false } as Board,
      second = { isDestroyed: false } as Board;
    BOARD_TO_CONTAINER.set(first, outer);
    BOARD_TO_CONTAINER.set(second, inner);
    let event!: Event;
    inner.addEventListener("test", value => {
      event = value;
    });
    inner.dispatchEvent(new Event("test"));
    expect(ownsBoardEvent(first, event)).toBe(false);
    expect(ownsBoardEvent(second, event)).toBe(true);
    BOARD_TO_CONTAINER.delete(first);
    BOARD_TO_CONTAINER.delete(second);
  });
});
