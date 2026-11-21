/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import Board from "../../Board";
import BoardContent from "../../components/BoardContent";
import { BoardContext, SelectionContext } from "../../context";
import { BoardElement, Selection, ViewPort } from "../../types";

const EMPTY_SELECTION: Selection = {
  selectArea: null,
  selectedElements: [],
};

const DEFAULT_VIEW_PORT: ViewPort = {
  minX: 0,
  minY: 0,
  width: 1200,
  height: 800,
  zoom: 1,
};

const createElement = (id: string): BoardElement => ({
  id,
  type: "geometry",
  x: 100,
  y: 100,
  width: 100,
  height: 60,
});

const createBoardStub = () => {
  return {
    children: [],
    on: () => {},
    off: () => {},
    renderElements: (elements: BoardElement[]) =>
      elements.map(element => <g key={element.id} data-el-id={element.id} />),
  } as unknown as Board;
};

describe("BoardContent 图层顺序", () => {
  it("连接点层应位于选中交互层之下", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const board = createBoardStub();

    await act(async () => {
      root.render(
        <BoardContext.Provider value={board}>
          <SelectionContext.Provider value={EMPTY_SELECTION}>
            <BoardContent
              board={board}
              viewPort={DEFAULT_VIEW_PORT}
              centerConnectArrows={[createElement("center-arrow")]}
              noneCenterConnectArrows={[createElement("normal-node")]}
              centerConnectAndSelectedArrows={[createElement("selected-arrow")]}
              disableViewportFilter={true}
              showAssistLayers={false}
            />
          </SelectionContext.Provider>
        </BoardContext.Provider>
      );
    });

    const svg = container.querySelector<SVGSVGElement>('svg[data-whiteboard-canvas="true"]');
    expect(svg).toBeTruthy();
    if (!svg) return;

    const connectPointLayer = svg.querySelector<SVGGElement>(
      'g[data-layer="connect-point-overlay"]'
    );
    const selectedInteractionLayer = svg.querySelector<SVGGElement>(
      'g[data-layer="selected-interaction-elements"]'
    );

    expect(connectPointLayer).toBeTruthy();
    expect(selectedInteractionLayer).toBeTruthy();
    if (!connectPointLayer || !selectedInteractionLayer) return;

    const position = connectPointLayer.compareDocumentPosition(selectedInteractionLayer);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await act(async () => {
      root.unmount();
    });
  });
});

it("嵌套容器不动时，跨过可见边界的孙节点仍会挂载", async () => {
  const leaf = { ...createElement("leaf"), x: 4000 };
  const inner = { ...createElement("inner"), width: 5000, children: [leaf] };
  const outer = { ...createElement("outer"), width: 5000, children: [inner] };
  const board = new Board([outer], DEFAULT_VIEW_PORT, EMPTY_SELECTION, [
    {
      name: "geometry",
      render: (_board, { element, children }) => <g data-node={element.id}>{children}</g>,
      getBounds: (_board, node) => ({
        minX: node.x,
        minY: node.y,
        maxX: node.x + node.width,
        maxY: node.y + node.height,
      }),
    },
  ]);
  const host = document.createElement("div");
  const root = createRoot(host);
  const render = (minX: number) =>
    act(async () => {
      root.render(
        <BoardContext.Provider value={board}>
          <BoardContent
            board={board}
            viewPort={{ ...DEFAULT_VIEW_PORT, minX }}
            noneCenterConnectArrows={board.children}
            centerConnectArrows={[]}
            centerConnectAndSelectedArrows={[]}
            showAssistLayers={false}
          />
        </BoardContext.Provider>
      );
    });
  try {
    await render(0);
    expect(host.querySelector('[data-node="inner"]')).not.toBeNull();
    expect(host.querySelector('[data-node="leaf"]')).toBeNull();
    await render(3600);
    expect(host.querySelector('[data-node="leaf"]')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    board.destroy();
  }
});
