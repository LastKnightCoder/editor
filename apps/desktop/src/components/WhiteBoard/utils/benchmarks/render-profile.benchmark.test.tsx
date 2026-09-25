/**
 * @vitest-environment jsdom
 */
import { performance } from "node:perf_hooks";
import React, { Profiler, memo, useEffect, useRef, useSyncExternalStore } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import Board from "../../Board";
import BoardContent from "../../components/BoardContent";
import { BoardContext, SelectionContext, ViewPortContext } from "../../context";
import { useSelectState } from "../../hooks/useSelectState";
import useElementsSorting from "../../hooks/useElementsSorting";
import { BoardElement, IBoardPlugin, Point, Selection, ViewPort } from "../../types";

type Scenario = "selection" | "arrow";

type BenchArrowElement = BoardElement & {
  type: "arrow";
  points: Point[];
  source: { connectId?: string };
  target: { connectId?: string };
};

const EMPTY_REF_LINES: Array<{
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}> = [];

const DEFAULT_VIEW_PORT: ViewPort = {
  minX: 0,
  minY: 0,
  width: 20000,
  height: 20000,
  zoom: 1,
};

const EMPTY_SELECTION: Selection = {
  selectArea: null,
  selectedElements: [],
};

const BenchRectView = memo(({ element }: { element: BoardElement }) => {
  const { isSelected } = useSelectState(element.id);
  const stroke = isSelected ? "#1677ff" : "#5f5f5f";
  const strokeWidth = isSelected ? 2 : 1;

  return (
    <rect
      x={element.x}
      y={element.y}
      width={element.width}
      height={element.height}
      fill="#ffffff"
      stroke={stroke}
      strokeWidth={strokeWidth}
    />
  );
});

const BenchArrowView = memo(({ element }: { element: BenchArrowElement }) => {
  const { isSelected } = useSelectState(element.id);
  const start = element.points[0];
  const end = element.points[element.points.length - 1];
  if (!start || !end) return null;

  return (
    <line
      x1={start.x}
      y1={start.y}
      x2={end.x}
      y2={end.y}
      stroke={isSelected ? "#ff4d4f" : "#999999"}
      strokeWidth={isSelected ? 2 : 1}
    />
  );
});

class BenchRectPlugin implements IBoardPlugin {
  name = "rect";

  render(_board: Board, { element }: { element: BoardElement }) {
    return <BenchRectView key={element.id} element={element} />;
  }
}

class BenchArrowPlugin implements IBoardPlugin {
  name = "arrow";

  render(_board: Board, { element }: { element: BoardElement }) {
    return <BenchArrowView key={element.id} element={element as BenchArrowElement} />;
  }
}

const createBenchmarkElements = (rectCount: number, arrowCount: number) => {
  const columns = Math.ceil(Math.sqrt(rectCount));
  const rects: BoardElement[] = Array.from({ length: rectCount }, (_, index) => {
    const x = (index % columns) * 40;
    const y = Math.floor(index / columns) * 40;
    return {
      id: `rect-${index}`,
      type: "rect",
      x,
      y,
      width: 28,
      height: 28,
    };
  });

  const arrows: BenchArrowElement[] = Array.from({ length: arrowCount }, (_, index) => {
    const sourceIndex = index % rectCount;
    const targetIndex = (index * 7 + 11) % rectCount;
    const source = rects[sourceIndex];
    const target = rects[targetIndex];
    const sourceCenter = {
      x: source.x + source.width / 2,
      y: source.y + source.height / 2,
    };
    const targetCenter = {
      x: target.x + target.width / 2,
      y: target.y + target.height / 2,
    };
    return {
      id: `arrow-${index}`,
      type: "arrow",
      x: Math.min(sourceCenter.x, targetCenter.x),
      y: Math.min(sourceCenter.y, targetCenter.y),
      width: Math.abs(targetCenter.x - sourceCenter.x),
      height: Math.abs(targetCenter.y - sourceCenter.y),
      points: [sourceCenter, targetCenter],
      source: {
        connectId: index % 2 === 0 ? "center" : "right",
      },
      target: {
        connectId: index % 3 === 0 ? "center" : "left",
      },
    };
  });

  return [...rects, ...arrows];
};

const summarizeDurations = (values: number[]) => {
  if (values.length === 0) {
    return { avg: 0, p50: 0, p95: 0, min: 0, max: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  return { avg, p50, p95, min, max };
};

const RenderProfileHarness = ({
  initChildren,
  onBoardReady,
  onProfilerRender,
}: {
  initChildren: BoardElement[];
  onBoardReady: (board: Board) => void;
  onProfilerRender: React.ProfilerOnRenderCallback;
}) => {
  const boardRef = useRef<Board | null>(null);
  if (!boardRef.current) {
    boardRef.current = new Board(
      initChildren,
      DEFAULT_VIEW_PORT,
      EMPTY_SELECTION,
      [new BenchArrowPlugin(), new BenchRectPlugin()],
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
          <Profiler id="whiteboard-render-profile" onRender={onProfilerRender}>
            <BoardContent
              board={board}
              viewPort={viewPort}
              centerConnectArrows={centerConnectArrows}
              noneCenterConnectArrows={noneCenterConnectArrows}
              centerConnectAndSelectedArrows={centerConnectAndSelectedArrows}
              isolateStaticSelection={isolateStaticSelection}
              gridVisible={false}
              showAssistLayers={false}
              refLines={EMPTY_REF_LINES}
            />
          </Profiler>
        </ViewPortContext.Provider>
      </SelectionContext.Provider>
    </BoardContext.Provider>
  );
};

const runBenchmark = process.env.WHITEBOARD_RENDER_BENCH === "1";

(runBenchmark ? describe : describe.skip)("WhiteBoard 渲染 Profile 基线", () => {
  it("使用 React Profiler 量化 selection/arrow 操作脚本开销", { timeout: 120000 }, async () => {
    const rectCount = Number(process.env.RENDER_BENCH_RECTS ?? "1600");
    const arrowCount = Number(process.env.RENDER_BENCH_ARROWS ?? "400");
    const selectionOps = Number(process.env.RENDER_BENCH_SELECTION_OPS ?? "160");
    const arrowOps = Number(process.env.RENDER_BENCH_ARROW_OPS ?? "160");
    const rounds = Number(process.env.RENDER_BENCH_ROUNDS ?? "6");
    const warmupRounds = Number(process.env.RENDER_BENCH_WARMUP_ROUNDS ?? "2");

    const initChildren = createBenchmarkElements(rectCount, arrowCount);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    let board: Board | null = null;
    const currentScenarioRef: { current: Scenario | null } = {
      current: null,
    };
    const profilerDurations: Record<Scenario, number[]> = {
      selection: [],
      arrow: [],
    };

    const handleProfilerRender: React.ProfilerOnRenderCallback = (_id, _phase, actualDuration) => {
      const scenario = currentScenarioRef.current;
      if (!scenario) return;
      profilerDurations[scenario].push(actualDuration);
    };

    await act(async () => {
      root.render(
        <RenderProfileHarness
          initChildren={initChildren}
          onBoardReady={instance => {
            board = instance;
          }}
          onProfilerRender={handleProfilerRender}
        />
      );
    });

    expect(board).toBeTruthy();
    if (!board) return;
    const boardInstance = board as Board;

    const applySelectionScript = () => {
      for (let i = 0; i < selectionOps; i++) {
        const targetIndex = (i * 13) % rectCount;
        const target = boardInstance.children[targetIndex];
        if (!target) continue;
        act(() => {
          boardInstance.apply(
            {
              type: "set_selection",
              properties: boardInstance.selection,
              newProperties: {
                selectArea: null,
                selectedElements: [target],
              },
            },
            false
          );
        });
      }
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
    };

    const applyArrowScript = () => {
      for (let i = 0; i < arrowOps; i++) {
        const arrowIndex = (i * 11) % arrowCount;
        const pathIndex = rectCount + arrowIndex;
        const currentArrow = boardInstance.children[pathIndex] as BenchArrowElement;
        if (!currentArrow || currentArrow.type !== "arrow") continue;
        const currentConnectId = currentArrow.source?.connectId ?? "right";
        const nextConnectId = currentConnectId === "center" ? "right" : "center";

        act(() => {
          boardInstance.apply(
            {
              type: "set_node",
              path: [pathIndex],
              properties: {
                source: currentArrow.source,
              },
              newProperties: {
                source: {
                  ...currentArrow.source,
                  connectId: nextConnectId,
                },
              },
            },
            false
          );
        });
      }
    };

    const runScenario = (scenario: Scenario, script: () => void) => {
      currentScenarioRef.current = scenario;
      const start = performance.now();
      script();
      const duration = performance.now() - start;
      currentScenarioRef.current = null;
      return duration;
    };

    for (let i = 0; i < warmupRounds; i++) {
      runScenario("selection", applySelectionScript);
      runScenario("arrow", applyArrowScript);
    }

    const selectionDurations: number[] = [];
    const arrowDurations: number[] = [];

    for (let i = 0; i < rounds; i++) {
      selectionDurations.push(runScenario("selection", applySelectionScript));
      arrowDurations.push(runScenario("arrow", applyArrowScript));
    }

    const selectionSummary = summarizeDurations(selectionDurations);
    const arrowSummary = summarizeDurations(arrowDurations);
    const selectionProfilerSummary = summarizeDurations(profilerDurations.selection);
    const arrowProfilerSummary = summarizeDurations(profilerDurations.arrow);

    console.info(
      `[render-profile] config rects=${rectCount}, arrows=${arrowCount}, selectionOps=${selectionOps}, arrowOps=${arrowOps}, rounds=${rounds}, warmupRounds=${warmupRounds}`
    );
    console.info(
      `[render-profile] selection script avg=${selectionSummary.avg.toFixed(2)}ms, p50=${selectionSummary.p50.toFixed(2)}ms, p95=${selectionSummary.p95.toFixed(2)}ms, min=${selectionSummary.min.toFixed(2)}ms, max=${selectionSummary.max.toFixed(2)}ms`
    );
    console.info(
      `[render-profile] arrow script avg=${arrowSummary.avg.toFixed(2)}ms, p50=${arrowSummary.p50.toFixed(2)}ms, p95=${arrowSummary.p95.toFixed(2)}ms, min=${arrowSummary.min.toFixed(2)}ms, max=${arrowSummary.max.toFixed(2)}ms`
    );
    console.info(
      `[render-profile] profiler(selection) commits=${profilerDurations.selection.length}, avg=${selectionProfilerSummary.avg.toFixed(2)}ms, p50=${selectionProfilerSummary.p50.toFixed(2)}ms, p95=${selectionProfilerSummary.p95.toFixed(2)}ms`
    );
    console.info(
      `[render-profile] profiler(arrow) commits=${profilerDurations.arrow.length}, avg=${arrowProfilerSummary.avg.toFixed(2)}ms, p50=${arrowProfilerSummary.p50.toFixed(2)}ms, p95=${arrowProfilerSummary.p95.toFixed(2)}ms`
    );

    expect(selectionSummary.avg).toBeGreaterThan(0);
    expect(arrowSummary.avg).toBeGreaterThan(0);
    expect(profilerDurations.selection.length).toBeGreaterThan(0);
    expect(profilerDurations.arrow.length).toBeGreaterThan(0);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
