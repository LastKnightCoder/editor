import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import Board from "../../Board";
import { BoardElement } from "../../types";
import BoardUtil from "../BoardUtil";

const createRect = (id: string, overrides: Partial<BoardElement> = {}): BoardElement => ({
  id,
  type: "rect",
  x: 0,
  y: 0,
  width: 12,
  height: 12,
  ...overrides,
});

const createDefaultBounds = (element: BoardElement) => {
  if (
    typeof element.x === "number" &&
    typeof element.y === "number" &&
    typeof element.width === "number" &&
    typeof element.height === "number"
  ) {
    return {
      minX: Math.min(element.x, element.x + element.width),
      minY: Math.min(element.y, element.y + element.height),
      maxX: Math.max(element.x, element.x + element.width),
      maxY: Math.max(element.y, element.y + element.height),
    };
  }
  return null;
};

const defaultPointHit = (element: BoardElement, x: number, y: number) => {
  const bounds = createDefaultBounds(element);
  if (!bounds) return false;
  return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
};

const collectByDfs = (
  elements: BoardElement[],
  predicate: (element: BoardElement) => boolean
): BoardElement[] => {
  const result: BoardElement[] = [];
  const walk = (nodes: BoardElement[]) => {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (predicate(node)) {
        result.push(node);
      }
      if (node.children && node.children.length > 0) {
        walk(node.children);
      }
    }
  };
  walk(elements);
  return result;
};

const createBoardContext = (children: BoardElement[]) => {
  const board = {
    boardFlag: Board.boardFlag,
    children,
    getElementVersion: () => 0,
    isHit: (element: BoardElement, x: number, y: number) => defaultPointHit(element, x, y),
    isElementSelected: () => false,
    getBounds: (element: BoardElement) => createDefaultBounds(element),
  } as unknown as Board;

  return { board };
};

const summarizeDurations = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  return { avg, p50, p95, min, max };
};

const runDfs = (elements: BoardElement[], points: Array<{ x: number; y: number }>) => {
  const start = performance.now();
  let hitCount = 0;
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    hitCount += collectByDfs(elements, element =>
      defaultPointHit(element, point.x, point.y)
    ).length;
  }
  return { duration: performance.now() - start, hitCount };
};

const runIndex = (board: Board, points: Array<{ x: number; y: number }>) => {
  const start = performance.now();
  let hitCount = 0;
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    hitCount += BoardUtil.getHitElements(board, point.x, point.y).length;
  }
  return { duration: performance.now() - start, hitCount };
};

const runBenchmark = process.env.WHITEBOARD_HIT_BENCH === "1";

(runBenchmark ? describe : describe.skip)("WhiteBoard 命中性能基准", () => {
  it("对比 DFS 与空间索引耗时", { timeout: 120000 }, () => {
    const elementCount = Number(process.env.HIT_BENCH_ELEMENTS ?? "12000");
    const queryCount = Number(process.env.HIT_BENCH_QUERIES ?? "500");
    const rounds = Number(process.env.HIT_BENCH_ROUNDS ?? "8");
    const warmupRounds = Number(process.env.HIT_BENCH_WARMUP_ROUNDS ?? "2");

    const columns = Math.ceil(Math.sqrt(elementCount));
    const rows = Math.ceil(elementCount / columns);

    const elements = Array.from({ length: elementCount }, (_, index) =>
      createRect(`bench-${index}`, {
        x: (index % columns) * 16,
        y: Math.floor(index / columns) * 16,
      })
    );

    const points = Array.from({ length: queryCount }, (_, index) => ({
      x: ((index * 37) % columns) * 16 + 6,
      y: ((index * 19) % rows) * 16 + 6,
    }));

    const { board } = createBoardContext(elements);

    BoardUtil.getHitElements(board, points[0].x, points[0].y);

    for (let i = 0; i < warmupRounds; i++) {
      runDfs(elements, points);
      runIndex(board, points);
    }

    const dfsDurations: number[] = [];
    const indexDurations: number[] = [];

    for (let i = 0; i < rounds; i++) {
      const dfs = runDfs(elements, points);
      const index = runIndex(board, points);
      expect(index.hitCount).toBe(dfs.hitCount);
      dfsDurations.push(dfs.duration);
      indexDurations.push(index.duration);
    }

    const dfsSummary = summarizeDurations(dfsDurations);
    const indexSummary = summarizeDurations(indexDurations);
    const speedup = dfsSummary.avg / Math.max(indexSummary.avg, 0.01);

    console.info(
      `[hit-benchmark] config elements=${elementCount}, queries=${queryCount}, rounds=${rounds}, warmupRounds=${warmupRounds}`
    );
    console.info(
      `[hit-benchmark] dfs avg=${dfsSummary.avg.toFixed(2)}ms, p50=${dfsSummary.p50.toFixed(2)}ms, p95=${dfsSummary.p95.toFixed(2)}ms, min=${dfsSummary.min.toFixed(2)}ms, max=${dfsSummary.max.toFixed(2)}ms`
    );
    console.info(
      `[hit-benchmark] index avg=${indexSummary.avg.toFixed(2)}ms, p50=${indexSummary.p50.toFixed(2)}ms, p95=${indexSummary.p95.toFixed(2)}ms, min=${indexSummary.min.toFixed(2)}ms, max=${indexSummary.max.toFixed(2)}ms`
    );
    console.info(`[hit-benchmark] avg speedup=${speedup.toFixed(2)}x`);

    expect(dfsSummary.avg).toBeGreaterThan(0);
    expect(indexSummary.avg).toBeGreaterThan(0);
  });
});
