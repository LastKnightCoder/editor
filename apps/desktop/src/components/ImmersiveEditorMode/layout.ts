/**
 * 沉浸写作的版面规则：版心按编辑器常规字号排版，整列 CSS zoom 放大（可编辑场景下布局真实，
 * 光标命中、滚动高度、浮层定位都不需要换算）；光标跟随按视口高度比例决定滚动量。
 */

/** 版心逻辑宽度（与详情页正文列一致） */
export const COLUMN_WIDTH = 720;
/** 自适应：版心放大后约占屏宽的比例 */
const SCREEN_SHARE = 0.6;
const FIT_MIN = 1;
const FIT_MAX = 1.75;
/** 手动微调：在自适应倍率上乘的系数 */
export const ADJUST_MIN = 0.8;
export const ADJUST_MAX = 1.5;
const ADJUST_STEP = 0.1;

export function fitZoom(viewportWidth: number) {
  return Math.min(FIT_MAX, Math.max(FIT_MIN, (viewportWidth * SCREEN_SHARE) / COLUMN_WIDTH));
}

/** 窗口窄于放大后的版心时收窄（逻辑像素，zoom 前），两侧至少留 GUTTER 屏幕像素 */
const GUTTER = 32;
export function columnWidth(viewportWidth: number, zoom: number) {
  return Math.min(COLUMN_WIDTH, Math.max(0, viewportWidth - GUTTER * 2) / zoom);
}

export function stepAdjust(adjust: number, direction: 1 | -1) {
  const next = Math.round((adjust + ADJUST_STEP * direction) * 10) / 10;
  return Math.min(ADJUST_MAX, Math.max(ADJUST_MIN, next));
}

/**
 * typewriter：光标行钉在视线高度；comfort：光标越出舒适带才跟随，回到带内偏中的位置。
 */
export type FollowMode = "typewriter" | "comfort";

export const TYPEWRITER_LINE = 0.45;
const COMFORT_TOP = 0.2;
const COMFORT_BOTTOM = 0.75;
/** 小于该距离不滚，避免逐字抖动 */
const JITTER = 4;

/**
 * 光标（相对视口顶部的 y）需要的滚动增量；0 表示不动。
 * 边界由浏览器的 scrollTop 钳制，这里不处理。
 */
export function caretScrollDelta(caretY: number, viewportHeight: number, mode: FollowMode) {
  let target: number;
  if (mode === "typewriter") target = viewportHeight * TYPEWRITER_LINE;
  else if (caretY < viewportHeight * COMFORT_TOP) target = viewportHeight * 0.3;
  else if (caretY > viewportHeight * COMFORT_BOTTOM) target = viewportHeight * 0.6;
  else return 0;
  const delta = caretY - target;
  return Math.abs(delta) < JITTER ? 0 : delta;
}
