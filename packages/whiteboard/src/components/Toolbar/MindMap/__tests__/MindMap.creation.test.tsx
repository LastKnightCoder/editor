/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import WhiteBoard from "../../../../WhiteBoard";
import type Board from "../../../../Board";
import { SELECT_TOOL_ID, MIND_TOOL_ID } from "../../../../constants/tools";
import { createStandardWhiteboardExtensions } from "../../../../extensions/builtins";
import { useBoard } from "../../../../hooks/useBoard";

interface RenderResult {
  board: Board;
  host: HTMLDivElement;
  root: Root;
  canvas: Element;
  fire: (type: "pointerdown" | "pointerup", x: number, y: number) => Promise<void>;
  unmount: () => Promise<void>;
}

const renderWhiteBoard = async (): Promise<RenderResult> => {
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
  const { defineWhiteboardExtension } = await import("../../../../extensions/api");
  const capture = defineWhiteboardExtension({
    id: "test.capture",
    create: () => ({
      layers: [{ id: "test.capture.layer", position: "canvas", component: Capture }],
    }),
  });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <WhiteBoard
        extensions={[...createStandardWhiteboardExtensions(), capture]}
        initData={[]}
        initViewPort={{ minX: 0, minY: 0, width: 800, height: 600, zoom: 1 }}
        showAttributeSetter={false}
        showStatusBar={false}
      />
    );
  });
  const canvas = host.querySelector("svg[data-whiteboard-canvas]")!;
  const fire = async (type: "pointerdown" | "pointerup", x: number, y: number) => {
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

describe("思维导图工具创建", () => {
  it("点击工具栏按钮时只切换创建模式，不在白板上创建节点", async () => {
    const { board, host, unmount } = await renderWhiteBoard();
    const button = host.querySelector('button[aria-label="思维导图"]');
    expect(button).toBeTruthy();
    if (!button) return;

    await act(async () => {
      button.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          clientX: 20,
          clientY: 20,
        })
      );
    });

    expect(board.activeTool).toBe(MIND_TOOL_ID);
    expect(board.children).toHaveLength(0);

    await unmount();
  });

  it("点击白板画布时应在点击处创建思维导图根节点并复位工具", async () => {
    const { board, host, fire, unmount } = await renderWhiteBoard();
    const button = host.querySelector('button[aria-label="思维导图"]');
    expect(button).toBeTruthy();
    if (!button) return;

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await fire("pointerdown", 120, 80);
    await fire("pointerup", 120, 80);

    expect(board.activeTool).toBe(SELECT_TOOL_ID);
    expect(board.children).toHaveLength(1);
    // 旧实现的锚点规则：点击点为根节点左上角
    expect(board.children[0]).toMatchObject({
      type: "mind-node",
      x: 120,
      y: 80,
    });

    await unmount();
  });
});
