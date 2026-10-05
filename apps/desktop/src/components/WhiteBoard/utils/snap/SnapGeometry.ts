// 吸附纯几何：输入运动包围盒与候选包围盒，输出吸附偏移与"吸附后真正对齐"的参考线。
// 参考线只由吸附结果派生，不再另行匹配，保证"画出来的线 = 实际对齐的线"。
import { buildGapGuides, collectGaps, findNearestGapOffset } from "./SnapGaps";

export interface SnapBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type SnapAxis = "x" | "y";

export interface SnapGuide {
  key: string;
  /** align = 边/中心对齐线；gap = 等距测距线 */
  kind: "align" | "gap";
  /** align：x 轴画竖线、y 轴画横线；gap：沿该轴方向画测距线 */
  axis: SnapAxis;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** resize 时参与吸附的边：min = 左/上，max = 右/下 */
export type SnapEdge = "min" | "max";

export interface SnapResizeEdges {
  x?: SnapEdge;
  y?: SnapEdge;
}

/** 元素是否带有可用于吸附的有限包围盒字段 */
export const hasSnapBounds = <T extends object>(element: T): element is T & SnapBounds => {
  const { x, y, width, height } = element as Partial<SnapBounds>;
  return [x, y, width, height].every(value => typeof value === "number" && Number.isFinite(value));
};

/** 多个包围盒的并集；为空返回 null */
export const unionBounds = (rects: SnapBounds[]): SnapBounds | null => {
  if (rects.length === 0) return null;
  const minX = Math.min(...rects.map(rect => rect.x));
  const minY = Math.min(...rects.map(rect => rect.y));
  const maxX = Math.max(...rects.map(rect => rect.x + rect.width));
  const maxY = Math.max(...rects.map(rect => rect.y + rect.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

interface SnapPoint {
  x: number;
  y: number;
}

// 吸附后坐标的判等容差（画布单位），吸收浮点误差
const ALIGN_EPSILON = 0.01;

const axisValues = (bounds: SnapBounds, axis: SnapAxis): number[] => {
  const start = axis === "x" ? bounds.x : bounds.y;
  const size = axis === "x" ? bounds.width : bounds.height;
  return [start, start + size / 2, start + size];
};

const edgeValue = (bounds: SnapBounds, axis: SnapAxis, edge: SnapEdge): number => {
  const start = axis === "x" ? bounds.x : bounds.y;
  const size = axis === "x" ? bounds.width : bounds.height;
  return edge === "min" ? start : start + size;
};

const boundsPoints = (bounds: SnapBounds): SnapPoint[] => {
  const xs = axisValues(bounds, "x");
  const ys = axisValues(bounds, "y");
  return xs.flatMap(x => ys.map(y => ({ x, y })));
};

/** 在候选值里找离 sources 中任一值最近、且在阈值内的偏移；找不到返回 null */
const findNearestOffset = (
  sources: number[],
  targets: number[],
  threshold: number
): number | null => {
  let best: number | null = null;
  for (const source of sources) {
    for (const target of targets) {
      const offset = target - source;
      if (Math.abs(offset) > threshold) continue;
      if (best === null || Math.abs(offset) < Math.abs(best)) best = offset;
    }
  }
  return best;
};

/**
 * 生成某个轴上的参考线：sources 里每个与候选点重合的值合并成一条线，
 * 线的跨度覆盖运动点与所有对齐候选点。
 */
const buildGuides = (
  axis: SnapAxis,
  movingPoints: SnapPoint[],
  candidatePoints: SnapPoint[],
  sourceValues: number[]
): SnapGuide[] => {
  const across: SnapAxis = axis === "x" ? "y" : "x";
  const guides: SnapGuide[] = [];
  const seen: number[] = [];

  for (const value of sourceValues) {
    if (seen.some(other => Math.abs(other - value) < ALIGN_EPSILON)) continue;
    const aligned = candidatePoints.filter(point => Math.abs(point[axis] - value) < ALIGN_EPSILON);
    if (aligned.length === 0) continue;
    seen.push(value);

    const related = movingPoints
      .filter(point => Math.abs(point[axis] - value) < ALIGN_EPSILON)
      .concat(aligned);
    const acrossValues = related.map(point => point[across]);
    const start = Math.min(...acrossValues);
    const end = Math.max(...acrossValues);

    guides.push(
      axis === "x"
        ? { key: `x:${value}`, kind: "align", axis, x1: value, y1: start, x2: value, y2: end }
        : { key: `y:${value}`, kind: "align", axis, x1: start, y1: value, x2: end, y2: value }
    );
  }
  return guides;
};

const translate = (bounds: SnapBounds, dx: number, dy: number): SnapBounds => ({
  ...bounds,
  x: bounds.x + dx,
  y: bounds.y + dy,
});

/** 对齐与等距两类候选里取绝对值最小的偏移，相同时对齐优先 */
const pickNearest = (alignOffset: number | null, gapOffset: number | null): number => {
  if (alignOffset === null) return gapOffset ?? 0;
  if (gapOffset === null) return alignOffset;
  return Math.abs(gapOffset) < Math.abs(alignOffset) ? gapOffset : alignOffset;
};

/**
 * 移动吸附：运动包围盒的左/中/右、上/中/下与候选同类点比较，
 * 并与候选间的相邻间距比较（等距），每个轴只取最近的一个偏移。
 */
export const snapMove = (
  moving: SnapBounds,
  candidates: SnapBounds[],
  threshold: number
): { dx: number; dy: number; guides: SnapGuide[] } => {
  const offsets = (["x", "y"] as const).map(axis => {
    const targets = candidates.flatMap(bounds => axisValues(bounds, axis));
    const alignOffset = findNearestOffset(axisValues(moving, axis), targets, threshold);
    const gapOffset = findNearestGapOffset(moving, collectGaps(candidates, axis), axis, threshold);
    return pickNearest(alignOffset, gapOffset);
  });
  const [dx, dy] = offsets;

  const snapped = translate(moving, dx, dy);
  const movingPoints = boundsPoints(snapped);
  const candidatePoints = candidates.flatMap(boundsPoints);

  return {
    dx,
    dy,
    guides: [
      ...buildGuides("x", movingPoints, candidatePoints, axisValues(snapped, "x")),
      ...buildGuides("y", movingPoints, candidatePoints, axisValues(snapped, "y")),
      ...buildGapGuides(snapped, collectGaps(candidates, "x"), "x"),
      ...buildGapGuides(snapped, collectGaps(candidates, "y"), "y"),
    ],
  };
};

const applyEdgeOffset = (
  bounds: SnapBounds,
  axis: SnapAxis,
  edge: SnapEdge,
  offset: number
): SnapBounds => {
  if (axis === "x") {
    return edge === "min"
      ? { ...bounds, x: bounds.x + offset, width: bounds.width - offset }
      : { ...bounds, width: bounds.width + offset };
  }
  return edge === "min"
    ? { ...bounds, y: bounds.y + offset, height: bounds.height - offset }
    : { ...bounds, height: bounds.height + offset };
};

/**
 * 缩放吸附：只有正在拖动的边参与（与候选的左/中/右或上/中/下比较），
 * 吸附后若导致尺寸非正则放弃该轴。
 */
export const snapResize = (
  bounds: SnapBounds,
  edges: SnapResizeEdges,
  candidates: SnapBounds[],
  threshold: number
): { bounds: SnapBounds; guides: SnapGuide[] } => {
  let result = bounds;
  const snappedAxes: Array<[SnapAxis, SnapEdge]> = [];

  for (const axis of ["x", "y"] as const) {
    const edge = edges[axis];
    if (!edge) continue;
    const targets = candidates.flatMap(candidate => axisValues(candidate, axis));
    const offset = findNearestOffset([edgeValue(result, axis, edge)], targets, threshold);
    if (offset === null) continue;
    const next = applyEdgeOffset(result, axis, edge, offset);
    if ((axis === "x" ? next.width : next.height) <= 0) continue;
    result = next;
    snappedAxes.push([axis, edge]);
  }

  const movingPoints = boundsPoints(result);
  const candidatePoints = candidates.flatMap(boundsPoints);
  const guides = snappedAxes.flatMap(([axis, edge]) =>
    buildGuides(axis, movingPoints, candidatePoints, [edgeValue(result, axis, edge)])
  );

  return { bounds: result, guides };
};

const roundToGrid = (value: number, gridSize: number) => Math.round(value / gridSize) * gridSize;

/** 网格移动吸附：包围盒左上角取整到网格 */
export const snapMoveToGrid = (
  moving: SnapBounds,
  gridSize: number
): { dx: number; dy: number } => ({
  dx: roundToGrid(moving.x, gridSize) - moving.x,
  dy: roundToGrid(moving.y, gridSize) - moving.y,
});

/** 网格缩放吸附：正在拖动的边取整到网格 */
export const snapResizeToGrid = (
  bounds: SnapBounds,
  edges: SnapResizeEdges,
  gridSize: number
): SnapBounds => {
  let result = bounds;
  for (const axis of ["x", "y"] as const) {
    const edge = edges[axis];
    if (!edge) continue;
    const value = edgeValue(result, axis, edge);
    const next = applyEdgeOffset(result, axis, edge, roundToGrid(value, gridSize) - value);
    if ((axis === "x" ? next.width : next.height) > 0) result = next;
  }
  return result;
};
