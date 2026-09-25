/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

const electronMocks = vi.hoisted(() => ({
  invoke: vi.fn(() => Promise.resolve({})),
  send: vi.fn(),
  sendSync: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  platform: "web",
}));
vi.mock("@/electron", () => electronMocks);
import Board from "../../Board";
import BoardContent from "../../components/BoardContent";
import { BoardContext, SelectionContext, ViewPortContext } from "../../context";
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

const EMPTY_REF_LINES: Array<{
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}> = [];

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
            <ViewPortContext.Provider value={DEFAULT_VIEW_PORT}>
              <BoardContent
                board={board}
                viewPort={DEFAULT_VIEW_PORT}
                centerConnectArrows={[createElement("center-arrow")]}
                noneCenterConnectArrows={[createElement("normal-node")]}
                centerConnectAndSelectedArrows={[createElement("selected-arrow")]}
                disableViewportFilter={true}
                showAssistLayers={false}
                refLines={EMPTY_REF_LINES}
              />
            </ViewPortContext.Provider>
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
