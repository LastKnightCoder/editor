/**
 * @vitest-environment jsdom
 */
import { memo, useEffect, useRef, useSyncExternalStore } from "react";
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
import useElementsSorting from "../../hooks/useElementsSorting";
import { BoardElement, IBoardPlugin, Point, Selection, ViewPort } from "../../types";

type BenchArrowElement = BoardElement & {
  type: "arrow";
  points: Point[];
  source: { connectId?: string };
  target: { connectId?: string };
};

const DEFAULT_VIEW_PORT: ViewPort = {
  minX: 0,
  minY: 0,
  width: 3000,
  height: 3000,
  zoom: 1,
};

const EMPTY_SELECTION: Selection = {
  selectArea: null,
  selectedElements: [],
};

const mountStats = {
  image: { mount: 0, unmount: 0 },
  webview: { mount: 0, unmount: 0 },
};

const TrackedResourceView = memo(
  ({ element, resourceType }: { element: BoardElement; resourceType: "image" | "webview" }) => {
    useEffect(() => {
      mountStats[resourceType].mount += 1;
      return () => {
        mountStats[resourceType].unmount += 1;
      };
    }, [resourceType]);

    return (
      <rect
        x={element.x}
        y={element.y}
        width={element.width}
        height={element.height}
        fill={resourceType === "image" ? "#ffd6a5" : "#90e0ef"}
      />
    );
  }
);

const RectView = memo(({ element }: { element: BoardElement }) => {
  return (
    <rect
      x={element.x}
      y={element.y}
      width={element.width}
      height={element.height}
      fill="#d9f99d"
    />
  );
});

const ArrowView = memo(({ element }: { element: BenchArrowElement }) => {
  const start = element.points[0];
  const end = element.points[element.points.length - 1];
  if (!start || !end) return null;

  return <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#9ca3af" strokeWidth={2} />;
});

class BenchImagePlugin implements IBoardPlugin {
  name = "image";

  render(_board: Board, { element }: { element: BoardElement }) {
    return <TrackedResourceView key={element.id} element={element} resourceType="image" />;
  }
}

class BenchWebviewPlugin implements IBoardPlugin {
  name = "webview";

  render(_board: Board, { element }: { element: BoardElement }) {
    return <TrackedResourceView key={element.id} element={element} resourceType="webview" />;
  }
}

class BenchRectPlugin implements IBoardPlugin {
  name = "rect";

  render(_board: Board, { element }: { element: BoardElement }) {
    return <RectView key={element.id} element={element} />;
  }
}

class BenchArrowPlugin implements IBoardPlugin {
  name = "arrow";

  render(_board: Board, { element }: { element: BoardElement }) {
    return <ArrowView key={element.id} element={element as BenchArrowElement} />;
  }
}

const RenderHarness = ({
  initChildren,
  onBoardReady,
}: {
  initChildren: BoardElement[];
  onBoardReady: (board: Board) => void;
}) => {
  const boardRef = useRef<Board | null>(null);
  if (!boardRef.current) {
    boardRef.current = new Board(
      initChildren,
      DEFAULT_VIEW_PORT,
      EMPTY_SELECTION,
      [
        new BenchArrowPlugin(),
        new BenchRectPlugin(),
        new BenchImagePlugin(),
        new BenchWebviewPlugin(),
      ],
      [],
      false
    );
  }
  const board = boardRef.current;

  const { children, viewPort, selection } = useSyncExternalStore(
    board.subscribe,
    board.getSnapshot
  );
  const {
    centerConnectArrows,
    noneCenterConnectArrows,
    centerConnectAndSelectedArrows,
    isolateStaticSelection,
  } = useElementsSorting(children, selection);

  useEffect(() => {
    onBoardReady(board);
  }, [board, onBoardReady]);

  useEffect(() => {
    return () => {
      board.destroy();
    };
  }, [board]);

  return (
    <BoardContext.Provider value={board}>
      <SelectionContext.Provider value={selection}>
        <ViewPortContext.Provider value={viewPort}>
          <BoardContent
            board={board}
            viewPort={viewPort}
            centerConnectArrows={centerConnectArrows}
            noneCenterConnectArrows={noneCenterConnectArrows}
            centerConnectAndSelectedArrows={centerConnectAndSelectedArrows}
            isolateStaticSelection={isolateStaticSelection}
            gridVisible={false}
            showAssistLayers={false}
          />
        </ViewPortContext.Provider>
      </SelectionContext.Provider>
    </BoardContext.Provider>
  );
};

describe("BoardContent 选中变化稳定性", () => {
  it("切换选中元素时 image/webview 不应重挂载", async () => {
    mountStats.image.mount = 0;
    mountStats.image.unmount = 0;
    mountStats.webview.mount = 0;
    mountStats.webview.unmount = 0;

    const initChildren: BoardElement[] = [
      {
        id: "image-1",
        type: "image",
        x: 100,
        y: 120,
        width: 240,
        height: 140,
      },
      {
        id: "webview-1",
        type: "webview",
        x: 380,
        y: 120,
        width: 260,
        height: 160,
      },
      {
        id: "rect-1",
        type: "rect",
        x: 120,
        y: 360,
        width: 120,
        height: 80,
      },
      {
        id: "arrow-1",
        type: "arrow",
        x: 260,
        y: 340,
        width: 200,
        height: 40,
        points: [
          { x: 260, y: 360 },
          { x: 460, y: 360 },
        ],
        source: { connectId: "center" },
        target: { connectId: "right" },
      } as BenchArrowElement,
    ];

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    let board: Board | null = null;
    await act(async () => {
      root.render(
        <RenderHarness
          initChildren={initChildren}
          onBoardReady={instance => {
            board = instance;
          }}
        />
      );
    });

    expect(board).toBeTruthy();
    if (!board) return;

    const boardInstance = board as Board;
    const rectElement = boardInstance.children.find(item => item.id === "rect-1");
    const arrowElement = boardInstance.children.find(item => item.id === "arrow-1");

    expect(rectElement).toBeTruthy();
    expect(arrowElement).toBeTruthy();

    expect(mountStats.image.mount).toBe(1);
    expect(mountStats.webview.mount).toBe(1);
    expect(mountStats.image.unmount).toBe(0);
    expect(mountStats.webview.unmount).toBe(0);

    act(() => {
      boardInstance.apply(
        {
          type: "set_selection",
          properties: boardInstance.selection,
          newProperties: {
            selectArea: null,
            selectedElements: rectElement ? [rectElement] : [],
          },
        },
        false
      );
    });

    act(() => {
      boardInstance.apply(
        {
          type: "set_selection",
          properties: boardInstance.selection,
          newProperties: {
            selectArea: null,
            selectedElements: arrowElement ? [arrowElement] : [],
          },
        },
        false
      );
    });

    act(() => {
      boardInstance.apply(
        {
          type: "set_selection",
          properties: boardInstance.selection,
          newProperties: {
            selectArea: null,
            selectedElements: [],
          },
        },
        false
      );
    });

    expect(mountStats.image.mount).toBe(1);
    expect(mountStats.webview.mount).toBe(1);
    expect(mountStats.image.unmount).toBe(0);
    expect(mountStats.webview.unmount).toBe(0);

    await act(async () => {
      root.unmount();
    });

    expect(mountStats.image.unmount).toBe(1);
    expect(mountStats.webview.unmount).toBe(1);
  });
});
