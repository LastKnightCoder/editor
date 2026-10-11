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
import { defineWhiteboardExtension, defineElement } from "../extensions/api";
import { useBoard } from "../hooks/useBoard";
import { useZoom } from "../hooks/useZoom";

/**
 * 平移（右键拖拽）与缩放的渲染成本：
 * - 视口帧的元素剔除/JSX 重建经 useDeferredValue 低优先级追赶（紧急渲染只更新 viewBox）；
 * - 只关心缩放的组件经 useZoom 订阅：纯平移（zoom 不变）零重渲。
 */

let zoomProbeRenders = 0;
let lastZoom = 0;

function ZoomProbe() {
  zoomProbeRenders += 1;
  lastZoom = useZoom();
  return <g data-testid="zoom-probe" />;
}

const countingExtension = defineWhiteboardExtension({
  id: "test.counting",
  create: () => ({
    elements: [
      defineElement({
        type: "test.card",
        render: () => <ZoomProbe />,
      }),
    ],
  }),
});

interface RenderResult {
  board: Board;
  host: HTMLDivElement;
  root: Root;
  canvas: Element;
  fire: (
    type: "pointerdown" | "pointermove" | "pointerup",
    x: number,
    y: number,
    button?: number
  ) => Promise<void>;
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
        extensions={[...createStandardWhiteboardExtensions(), countingExtension, capture]}
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
  const fire = async (
    type: "pointerdown" | "pointermove" | "pointerup",
    x: number,
    y: number,
    button = 0
  ) => {
    await act(async () => {
      canvas.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          button,
          buttons: type === "pointerup" ? 0 : button === 2 ? 2 : 1,
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
  vi.restoreAllMocks();
  document.body.replaceChildren();
  zoomProbeRenders = 0;
  lastZoom = 0;
});

describe("平移与缩放的渲染成本", () => {
  it("右键拖拽平移：viewBox 紧急跟随，不触发落库", async () => {
    // 跨过 PanningState 的 30ms 节流，让每个 pointermove 都产生平移帧
    let now = Date.now();
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => (now += 50));
    try {
      const onChange = vi.fn();
      const cards = [{ id: "card-1", type: "test.card", x: 0, y: 0, width: 120, height: 80 }];
      const { board, canvas, fire, unmount } = await renderBoard(onChange, cards as BoardElement[]);
      const viewBox0 = canvas.getAttribute("viewBox");

      onChange.mockClear();
      await fire("pointerdown", 400, 300, 2);
      for (let i = 1; i <= 5; i++) {
        await fire("pointermove", 400 + i * 40, 300, 2);
      }
      await fire("pointerup", 600, 300, 2);

      expect(board.viewPort.minX).toBe(-200);
      expect(canvas.getAttribute("viewBox")).not.toBe(viewBox0);
      await unmount();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("useZoom：纯平移零重渲，缩放变化正常更新", async () => {
    let now = Date.now();
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => (now += 50));
    try {
      const onChange = vi.fn();
      const cards = [{ id: "card-1", type: "test.card", x: 0, y: 0, width: 120, height: 80 }];
      const { board, fire, unmount } = await renderBoard(onChange, cards as BoardElement[]);

      // 初始渲染后取样
      const renders0 = zoomProbeRenders;

      // 格内平移 4 帧（共 60px）：剔除/JSX 按量化格缓存，仅在跨格瞬间重算一次
      //（修复前每个视口帧都全量重建元素树并穿透 ViewPortContext 重渲订阅者：+4）
      await fire("pointerdown", 400, 300, 2);
      for (let i = 1; i <= 4; i++) {
        await fire("pointermove", 400 + i * 15, 300, 2);
      }
      await fire("pointerup", 460, 300, 2);
      expect(board.viewPort.minX).toBe(-60);
      expect(zoomProbeRenders - renders0).toBeLessThanOrEqual(1);

      // 缩放变化：ZoomProbe 收到新值并重渲
      await act(async () => {
        board.apply({
          type: "set_viewport",
          properties: { ...board.viewPort },
          newProperties: { ...board.viewPort, zoom: 2 },
        });
      });
      expect(lastZoom).toBe(2);
      expect(zoomProbeRenders).toBeGreaterThan(renders0);
      await unmount();
    } finally {
      nowSpy.mockRestore();
    }
  });
});
