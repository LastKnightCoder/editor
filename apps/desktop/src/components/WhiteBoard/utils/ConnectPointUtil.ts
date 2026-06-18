import { ArrowElement, BoardElement, CustomOffset, Point } from "../types";
import {
  ARROW_CONNECT_ID,
  ARROW_CUSTOM_CONNECT_MIN_WORLD,
  ARROW_CUSTOM_CONNECT_PROXIMITY,
} from "../constants";

export type ConnectEdgeOrientation = "vertical" | "horizontal";

export interface CustomConnectCandidate {
  point: Point;
  customOffset: CustomOffset;
  distance: number;
}

const EPSILON = 1e-6;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/**
 * 计算"图形中心 → 鼠标"射线与图形 bbox 边缘的交点，作为自定义连接点候选。
 *
 * 采用 bbox slab 求交（与现有 5 个固定点同样基于 bbox 的模型一致）：
 * - 鼠标在 bbox 外时，交点为朝向鼠标一侧的近边点；
 * - 鼠标在 bbox 内时，交点为鼠标所在方位的边点（鼠标位于中心与该边点之间）。
 * 距离阈值过滤掉"鼠标深入图形内部"的情况——此时不吸附，保留为自由端点。
 */
export const getCustomConnectCandidate = (
  element: BoardElement & {
    x: number;
    y: number;
    width: number;
    height: number;
  },
  mousePoint: Point,
  zoom: number,
): CustomConnectCandidate | null => {
  const { x, y, width, height } = element;
  if (width <= 0 || height <= 0) return null;

  const cx = x + 0.5 * width;
  const cy = y + 0.5 * height;
  const dx = mousePoint.x - cx;
  const dy = mousePoint.y - cy;

  // 鼠标恰在中心，无法确定方向
  if (Math.abs(dx) <= EPSILON && Math.abs(dy) <= EPSILON) return null;

  const halfW = 0.5 * width;
  const halfH = 0.5 * height;
  const tx = Math.abs(dx) > EPSILON ? halfW / Math.abs(dx) : Infinity;
  const ty = Math.abs(dy) > EPSILON ? halfH / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);

  const exitX = cx + t * dx;
  const exitY = cy + t * dy;

  const point: Point = {
    x: Math.max(x, Math.min(x + width, exitX)),
    y: Math.max(y, Math.min(y + height, exitY)),
  };

  const customOffset: CustomOffset = {
    u: clamp01((point.x - x) / width),
    v: clamp01((point.y - y) / height),
  };

  const distance = Math.hypot(point.x - mousePoint.x, point.y - mousePoint.y);
  // 阈值取屏幕像素换算值与外扩框下限的较大者，避免外扩命中却被阈值拒绝
  const threshold = Math.max(
    ARROW_CUSTOM_CONNECT_PROXIMITY / zoom,
    ARROW_CUSTOM_CONNECT_MIN_WORLD,
  );
  if (distance > threshold) return null;

  return { point, customOffset, distance };
};

/**
 * 判断端点是否"落在图形 bbox 内部"（需要提升渲染层级避免被图形遮挡）。
 *
 * - center：始终为内部点（位于 bbox 中心）；
 * - custom：当 u、v 均严格处于 (0,1) 开区间时为内部点（非矩形几何图形的边缘交点可能落在 bbox 内）；
 * - top/bottom/left/right：位于 bbox 边界，不算内部。
 * 仅依赖 ArrowBound 自身字段，无需绑定图形几何，便于在排序/导出等遍历中直接调用。
 */
export const isInteriorConnectBound = (bound?: {
  connectId?: string;
  customOffset?: CustomOffset;
}): boolean => {
  if (!bound?.connectId) return false;
  if (bound.connectId === ARROW_CONNECT_ID.CENTER) return true;
  if (bound.connectId === ARROW_CONNECT_ID.CUSTOM && bound.customOffset) {
    const { u, v } = bound.customOffset;
    return u > EPSILON && u < 1 - EPSILON && v > EPSILON && v < 1 - EPSILON;
  }
  return false;
};

export const isInteriorConnectElement = (element: BoardElement): boolean => {
  if (element.type !== "arrow") return false;
  const arrow = element as ArrowElement;
  return (
    isInteriorConnectBound(arrow.source) || isInteriorConnectBound(arrow.target)
  );
};

/**
 * 根据连接点所在边缘的法线方向，决定正交线先走水平还是垂直。
 * - top/bottom 边（法线垂直）→ 先垂直；
 * - left/right 边（法线水平）→ 先水平；
 * - custom 内部点或无法判定 → 返回 null，由调用方回退到距离启发式。
 */
export const getConnectEdgeOrientation = (
  connectId?: string,
  customOffset?: CustomOffset,
): ConnectEdgeOrientation | null => {
  if (!connectId) return null;
  if (
    connectId === ARROW_CONNECT_ID.TOP ||
    connectId === ARROW_CONNECT_ID.BOTTOM
  ) {
    return "vertical";
  }
  if (
    connectId === ARROW_CONNECT_ID.LEFT ||
    connectId === ARROW_CONNECT_ID.RIGHT
  ) {
    return "horizontal";
  }
  if (connectId === ARROW_CONNECT_ID.CUSTOM && customOffset) {
    const { u, v } = customOffset;
    // 矩形自定义点恰在 bbox 边界上：上下边→垂直，左右边→水平；
    // 非矩形几何图形的边缘交点可能严格落在 bbox 内部 → 回退 null 由距离启发式处理。
    if (v <= EPSILON || v >= 1 - EPSILON) return "vertical";
    if (u <= EPSILON || u >= 1 - EPSILON) return "horizontal";
    return null;
  }
  return null;
};

export default {
  getCustomConnectCandidate,
  isInteriorConnectBound,
  isInteriorConnectElement,
  getConnectEdgeOrientation,
};
