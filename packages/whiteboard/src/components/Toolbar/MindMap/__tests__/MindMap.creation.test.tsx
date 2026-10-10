/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import Board from "../../../../Board";
import { BOARD_TO_CONTAINER } from "../../../../constants";
import { BoardContext } from "../../../../context";
import { MindPlugin } from "../../../../plugins";
import { ECreateBoardElementType } from "../../../../types";
import MindMap from "../index";

const createBoard = () =>
  new Board(
    [],
    { minX: 0, minY: 0, width: 1000, height: 1000, zoom: 1 },
    { selectedElements: [], selectArea: null },
    [new MindPlugin()]
  );

const renderMindMapToolbar = async () => {
  const board = createBoard();
  const container = document.createElement("div");
  document.body.appendChild(container);
  Object.defineProperty(container, "getBoundingClientRect", {
    value: () => ({ x: 0, y: 0, left: 0, top: 0, width: 1000, height: 1000 }),
  });
  BOARD_TO_CONTAINER.set(board, container);

  const root = createRoot(container);
  await act(async () => {
    root.render(
      <BoardContext.Provider value={board}>
        <div onClick={event => board.onClick(event.nativeEvent)}>
          <div data-testid="toolbar" onClick={event => event.stopPropagation()}>
            <MindMap
              run={() => {
                board.currentCreateType = ECreateBoardElementType.MindMap;
              }}
            />
          </div>
          <svg data-whiteboard-canvas="true" />
        </div>
      </BoardContext.Provider>
    );
  });

  return { board, container, root };
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("思维导图工具创建", () => {
  it("点击工具栏按钮时不应在白板上创建思维导图节点", async () => {
    const { board, container, root } = await renderMindMapToolbar();
    const button = container.querySelector('button[aria-label="思维导图"]');
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

    expect(board.currentCreateType).toBe(ECreateBoardElementType.MindMap);
    expect(board.children).toHaveLength(0);

    await act(async () => {
      root.unmount();
    });
  });

  it("点击白板画布时应创建思维导图节点", async () => {
    const { board, container, root } = await renderMindMapToolbar();
    const button = container.querySelector('button[aria-label="思维导图"]');
    const canvas = container.querySelector('svg[data-whiteboard-canvas="true"]');
    expect(button).toBeTruthy();
    expect(canvas).toBeTruthy();
    if (!button || !canvas) return;

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      canvas.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          clientX: 120,
          clientY: 80,
        })
      );
    });

    expect(board.currentCreateType).toBe(ECreateBoardElementType.None);
    expect(board.children).toHaveLength(1);
    expect(board.children[0]).toMatchObject({
      type: "mind-node",
      x: 120,
      y: 80,
    });

    await act(async () => {
      root.unmount();
    });
  });
});
