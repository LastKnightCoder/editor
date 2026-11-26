/**
 * @vitest-environment jsdom
 */
import { memo, useEffect, useLayoutEffect, useRef, useSyncExternalStore, StrictMode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import Board from "../../Board";
import BoardContent from "../../components/BoardContent";
import { ElementLayer } from "../../components/BoardContent/ElementLayer";
import { FrameUtil } from "../FrameUtil";
import { BoardContext, SelectionContext } from "../../context";
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
      <g>
        <rect
          x={element.x}
          y={element.y}
          width={element.width}
          height={element.height}
          fill={resourceType === "image" ? "#ffd6a5" : "#90e0ef"}
        />
        {resourceType === "webview" && (
          <foreignObject width={100} height={30}>
            <input defaultValue={element.id} />
          </foreignObject>
        )}
      </g>
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

function BenchFrameView({
  board,
  element,
  children,
}: {
  board: Board;
  element: BoardElement;
  children?: React.ReactNode;
}) {
  const ref = useRef<SVGGElement>(null);
  const current = useRef(element);
  current.current = element;
  useLayoutEffect(
    () =>
      ref.current ? board.framePresentation.register(current.current, ref.current) : undefined,
    [board, element.id]
  );
  useLayoutEffect(() => board.framePresentation.rendered(element), [board, element]);
  return (
    <g ref={ref} data-frame={element.id}>
      {children}
    </g>
  );
}

class BenchFramePlugin implements IBoardPlugin {
  constructor(private readonly presents = true) {}
  name = "frame";
  render(
    board: Board,
    { element, children }: { element: BoardElement; children?: React.ReactNode }
  ) {
    return this.presents ? (
      <BenchFrameView board={board} element={element}>
        {children}
      </BenchFrameView>
    ) : (
      <g data-frame={element.id}>{children}</g>
    );
  }
}

const RenderHarness = ({
  initChildren,
  onBoardReady,
  stable = false,
  strictLayer = false,
  registerFrames = true,
}: {
  initChildren: BoardElement[];
  onBoardReady: (board: Board) => void;
  stable?: boolean;
  strictLayer?: boolean;
  registerFrames?: boolean;
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
        new BenchFramePlugin(registerFrames),
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
        {stable ? (
          <svg>
            {strictLayer ? (
              <StrictMode>
                <ElementLayer
                  board={board}
                  elements={board.filterElementsInViewport(noneCenterConnectArrows, 0, viewPort)}
                  liveText={false}
                />
              </StrictMode>
            ) : (
              <ElementLayer
                board={board}
                elements={board.filterElementsInViewport(noneCenterConnectArrows, 0, viewPort)}
                liveText={false}
              />
            )}
          </svg>
        ) : (
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
        )}
      </SelectionContext.Provider>
    </BoardContext.Provider>
  );
};

describe("BoardContent 选中变化稳定性", () => {
  it.each(
    [false, true].flatMap(strict => [false, true].map(registered => [strict, registered] as const))
  )(
    "收纳、跨画框移动、解散及撤销重做保留资源实例和未提交的输入（StrictMode：%s，显示根：%s）",
    async (strict, registered) => {
      mountStats.image = { mount: 0, unmount: 0 };
      mountStats.webview = { mount: 0, unmount: 0 };
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      const captured: { board?: Board } = {};
      let clicks = 0;
      const harness = (
        <RenderHarness
          stable
          strictLayer={strict}
          registerFrames={registered}
          initChildren={[
            { id: "image", type: "image", x: 100, y: 100, width: 100, height: 80 },
            { id: "webview", type: "webview", x: 250, y: 100, width: 100, height: 80 },
          ]}
          onBoardReady={board => {
            captured.board = board;
          }}
        />
      );
      await act(async () =>
        root.render(
          <div
            onClick={() => {
              clicks++;
            }}
          >
            {harness}
          </div>
        )
      );
      const board = captured.board;
      if (!board) throw new Error("画布未挂载");
      const input = host.querySelector("input");
      if (!input) throw new Error("资源输入未挂载");
      input.value = "尚未提交的编辑";
      const initial = structuredClone(mountStats);
      const check = (parent: string | null) => {
        expect(host.querySelector("input")).toBe(input);
        expect(input.value).toBe("尚未提交的编辑");
        expect(
          board.children.find(node => node.children?.some(child => child.id === "webview"))?.id ??
            null
        ).toBe(parent);
        if (!registered)
          expect(input.closest("[data-frame]")?.getAttribute("data-frame") ?? null).toBe(parent);
        expect(
          [...host.querySelectorAll("[data-element-host]")].map(node =>
            node.getAttribute("data-element-host")
          )
        ).toEqual(["image", "webview"]);
        expect(mountStats).toEqual(initial);
        const before = clicks;
        act(() => {
          input.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        expect(clicks).toBe(before + 1);
      };
      const index = (id: string) => board.children.findIndex(node => node.id === id);
      const makeFrame = (id: string) => ({ ...FrameUtil.createFrame(80, 80, 500, 300), id });
      try {
        await act(async () => {
          board.apply(
            { type: "insert_node", path: [board.children.length], node: makeFrame("first") },
            true,
            "capture"
          );
          board.apply(
            { type: "move_node", path: [index("webview")], newPath: [index("first"), 0] },
            true,
            "capture"
          );
        });
        check("first");
        await act(async () => {
          board.apply(
            { type: "insert_node", path: [board.children.length], node: makeFrame("second") },
            true,
            "transfer"
          );
          board.apply(
            { type: "move_node", path: [index("first"), 0], newPath: [index("second"), 0] },
            true,
            "transfer"
          );
          board.apply(
            { type: "remove_node", path: [index("first")], node: board.children[index("first")] },
            true,
            "transfer"
          );
        });
        check("second");
        await act(async () => {
          board.apply(
            { type: "move_node", path: [index("second"), 0], newPath: [board.children.length] },
            true,
            "dissolve"
          );
          board.apply(
            { type: "remove_node", path: [index("second")], node: board.children[index("second")] },
            true,
            "dissolve"
          );
        });
        check(null);
        for (const [change, parent] of [
          [() => board.undo(), "second"],
          [() => board.undo(), "first"],
          [() => board.redo(), "second"],
          [() => board.redo(), null],
        ] as const) {
          await act(async () => change());
          check(parent);
        }
      } finally {
        await act(async () => root.unmount());
        host.remove();
      }
      expect(mountStats.webview.unmount).toBe(mountStats.webview.mount);
      expect(mountStats.image.unmount).toBe(mountStats.image.mount);
    }
  );

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
