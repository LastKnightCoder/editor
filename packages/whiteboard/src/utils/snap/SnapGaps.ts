// 等距吸附：候选两两之间的相邻间距，以及运动包围盒如何复用这些间距。
import type { SnapAxis, SnapBounds, SnapGuide } from "./SnapGeometry";

// 吸附后间距的判等容差（画布单位），吸收浮点误差
const GAP_EPSILON = 0.01;

interface Span {
  min: number;
  max: number;
}

/** 同一轴上相邻的两个候选：start 在前（左/上），end 在后（右/下） */
export interface SnapGap {
  start: SnapBounds;
  end: SnapBounds;
  length: number;
  /** 两者在垂直轴上的重叠区，测距线画在其中点 */
  across: Span;
}

const crossAxis = (axis: SnapAxis): SnapAxis => (axis === "x" ? "y" : "x");

const span = (bounds: SnapBounds, axis: SnapAxis): Span =>
  axis === "x"
    ? { min: bounds.x, max: bounds.x + bounds.width }
    : { min: bounds.y, max: bounds.y + bounds.height };

const overlap = (a: Span, b: Span): Span | null => {
  const min = Math.max(a.min, b.min);
  const max = Math.min(a.max, b.max);
  return min < max ? { min, max } : null;
};

const gapCache = new WeakMap<SnapBounds[], Partial<Record<SnapAxis, SnapGap[]>>>();

/**
 * 每个候选只与它在该轴正方向上、垂直方向有重叠的最近邻构成间距，
 * 避免中间隔着其他元素的远距离配对。结果按候选数组缓存（会话内候选不变）。
 */
export const collectGaps = (candidates: SnapBounds[], axis: SnapAxis): SnapGap[] => {
  const cached = gapCache.get(candidates)?.[axis];
  if (cached) return cached;

  const across = crossAxis(axis);
  const gaps: SnapGap[] = [];
  for (const start of candidates) {
    const startSpan = span(start, axis);
    const startAcross = span(start, across);
    let nearest: { end: SnapBounds; across: Span; min: number } | null = null;

    for (const end of candidates) {
      if (end === start) continue;
      const endMin = span(end, axis).min;
      if (endMin - startSpan.max <= GAP_EPSILON) continue;
      if (nearest && endMin >= nearest.min) continue;
      const shared = overlap(startAcross, span(end, across));
      if (shared) nearest = { end, across: shared, min: endMin };
    }

    if (nearest) {
      gaps.push({
        start,
        end: nearest.end,
        length: nearest.min - startSpan.max,
        across: nearest.across,
      });
    }
  }

  gapCache.set(candidates, { ...gapCache.get(candidates), [axis]: gaps });
  return gaps;
};

/** 运动包围盒复用间距的三种位置：居中于间距内、接在间距之后、接在间距之前 */
export const findNearestGapOffset = (
  moving: SnapBounds,
  gaps: SnapGap[],
  axis: SnapAxis,
  threshold: number
): number | null => {
  const across = crossAxis(axis);
  const movingSpan = span(moving, axis);
  const movingAcross = span(moving, across);
  const size = movingSpan.max - movingSpan.min;
  let best: number | null = null;

  const consider = (offset: number) => {
    if (Math.abs(offset) > threshold) return;
    if (best === null || Math.abs(offset) < Math.abs(best)) best = offset;
  };

  for (const gap of gaps) {
    const startSpan = span(gap.start, axis);
    const endSpan = span(gap.end, axis);
    if (size < gap.length && overlap(movingAcross, gap.across)) {
      consider(startSpan.max + (gap.length - size) / 2 - movingSpan.min);
    }
    if (overlap(movingAcross, span(gap.end, across))) {
      consider(endSpan.max + gap.length - movingSpan.min);
    }
    if (overlap(movingAcross, span(gap.start, across))) {
      consider(startSpan.min - gap.length - movingSpan.max);
    }
  }
  return best;
};

const measureGuide = (axis: SnapAxis, from: number, to: number, across: Span): SnapGuide => {
  const position = (across.min + across.max) / 2;
  return axis === "x"
    ? {
        key: `gap:x:${from}:${to}:${position}`,
        kind: "gap",
        axis,
        x1: from,
        y1: position,
        x2: to,
        y2: position,
      }
    : {
        key: `gap:y:${from}:${to}:${position}`,
        kind: "gap",
        axis,
        x1: position,
        y1: from,
        x2: position,
        y2: to,
      };
};

const isEqualLength = (a: number, b: number) => Math.abs(a - b) < GAP_EPSILON;

/**
 * 吸附后真正等距的测距线：运动包围盒两侧的新间距 + 与之等长且首尾相连的候选间距链。
 */
export const buildGapGuides = (
  moving: SnapBounds,
  gaps: SnapGap[],
  axis: SnapAxis
): SnapGuide[] => {
  const across = crossAxis(axis);
  const movingSpan = span(moving, axis);
  const movingAcross = span(moving, across);
  const guides: SnapGuide[] = [];
  const matched = new Set<SnapGap>();

  for (const gap of gaps) {
    const startSpan = span(gap.start, axis);
    const endSpan = span(gap.end, axis);

    const sharedWithGap = overlap(movingAcross, gap.across);
    const before = movingSpan.min - startSpan.max;
    const after = endSpan.min - movingSpan.max;
    if (sharedWithGap && before > 0 && after > 0 && isEqualLength(before, after)) {
      guides.push(
        measureGuide(axis, startSpan.max, movingSpan.min, sharedWithGap),
        measureGuide(axis, movingSpan.max, endSpan.min, sharedWithGap)
      );
      continue;
    }

    const sharedWithEnd = overlap(movingAcross, span(gap.end, across));
    if (sharedWithEnd && isEqualLength(movingSpan.min - endSpan.max, gap.length)) {
      guides.push(measureGuide(axis, endSpan.max, movingSpan.min, sharedWithEnd));
      matched.add(gap);
    }

    const sharedWithStart = overlap(movingAcross, span(gap.start, across));
    if (sharedWithStart && isEqualLength(startSpan.min - movingSpan.max, gap.length)) {
      guides.push(measureGuide(axis, movingSpan.max, startSpan.min, sharedWithStart));
      matched.add(gap);
    }
  }

  // 沿首尾相连且等长的间距扩展，完整展示等距序列
  const pending = [...matched];
  for (let current = pending.pop(); current; current = pending.pop()) {
    for (const gap of gaps) {
      if (matched.has(gap) || !isEqualLength(gap.length, current.length)) continue;
      const linked =
        gap.end === current.start ||
        gap.start === current.end ||
        gap.start === current.start ||
        gap.end === current.end;
      if (!linked) continue;
      matched.add(gap);
      pending.push(gap);
    }
  }
  matched.forEach(gap =>
    guides.push(measureGuide(axis, span(gap.start, axis).max, span(gap.end, axis).min, gap.across))
  );

  const seen = new Set<string>();
  return guides.filter(guide => !seen.has(guide.key) && Boolean(seen.add(guide.key)));
};
