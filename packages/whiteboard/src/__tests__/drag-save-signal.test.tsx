/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type Board from "../Board";
import WhiteBoard from "../WhiteBoard";
import type { BoardElement } from "../types";
import type { WhiteboardSnapshot } from "../extensions/api";
import { createStandardWhiteboardExtensions } from "../extensions/builtins";
import { defineWhiteboardExtension } from "../extensions/api";
import { useBoard } from "../hooks/useBoard";

/** 拖动落库信号：手势帧不触发 onChange（宿主落库防抖不被高频重置），手势结束统一补发一次。 */

interface RenderResult {
  board: Board;
  host: HTMLDivElement;
  root: Root;
  canvas: Element;
  fire: (type: "pointerdown" | "pointermove" | "pointerup", x: number, y: number) => Promise<void>;
  unmount: () => Promise<void>;
}

const renderBoard = async (
  onChange: (data: WhiteboardSnapshot) => void,
  initData: BoardElement[]
): Promise<RenderResult> => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
  let board!: Board;
  function Capture() {
    board = useBoard();
    return null;
  }
  const capture = defineWhiteboardExtension({
    id: "test.capture",
    create: () => ({
      layers: [{ id: "test.capture.layer", position: "canvas", component: Capture }],
    }),
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <WhiteBoard
        extensions={[...createStandardWhiteboardExtensions(), capture]}
        initData={initData}
        initViewPort={{ minX: 0, minY: 0, width: 800, height: 600, zoom: 1 }}
        showToolbar={false}
        showAttributeSetter={false}
        showStatusBar={false}
        onChange={onChange}
      />
    );
  });
  const canvas = host.querySelector("svg[data-whiteboard-canvas]")!;
  const fire = async (type: "pointerdown" | "pointermove" | "pointerup", x: number, y: number) => {
    await act(async () => {
      canvas.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
          clientX: x,
          clientY: y,
        })
      );
    });
  };
  return {
    board,
    host,
    root,
    canvas,
    fire,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
    },
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("拖动手势的 onChange 落库信号", () => {
  it("手势帧不触发 onChange，结束统一补发含最终位置的快照", async () => {
    const onChange = vi.fn();
    const frame = { id: "frame-1", type: "frame", x: 100, y: 100, width: 300, height: 200 };
    const { board, fire, unmount } = await renderBoard(onChange, [frame as BoardElement]);

    onChange.mockClear();
    await fire("pointerdown", 150, 150);
    for (let i = 1; i <= 12; i++) {
      await fire("pointermove", 150 + i * 15, 150);
    }
    // pointerdown 选区帧 + 首个 move 帧（element:move 尚未到达）+ 结束补发；
    // 手势中途的 move 帧不产生 onChange
    expect(onChange.mock.calls.length).toBeLessThanOrEqual(3);
    expect(onChange.mock.calls.length).toBeLessThan(12);
    await fire("pointerup", 330, 150);

    // 结束补发的快照带最终位置（dx = 180）
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(last.children.find((el: BoardElement) => el.id === "frame-1")).toMatchObject({
      x: 280,
      y: 100,
    });
    // 画布实际状态一致
    expect(board.children.find(el => el.id === "frame-1")).toMatchObject({ x: 280, y: 100 });
    await unmount();
  });

  it("非手势的程序化变更仍逐次通知 onChange", async () => {
    const onChange = vi.fn();
    const frame = { id: "frame-1", type: "frame", x: 100, y: 100, width: 300, height: 200 };
    const { board, unmount } = await renderBoard(onChange, [frame as BoardElement]);

    onChange.mockClear();
    await act(async () => {
      board.apply({
        type: "set_node",
        path: [0],
        properties: { x: frame.x },
        newProperties: { x: 120 },
      });
      board.apply({
        type: "set_node",
        path: [0],
        properties: { x: 120 },
        newProperties: { x: 140 },
      });
    });
    expect(onChange).toHaveBeenCalledTimes(2);
    await unmount();
  });
});
