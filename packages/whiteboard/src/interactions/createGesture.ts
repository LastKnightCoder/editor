import type { CreatePoint } from "../extensions/api";

/** 创建手势的拖动几何（rect/start/end 均为画布坐标，已应用约束） */
export interface CreateGeometry {
  rect: { x: number; y: number; width: number; height: number };
  start: CreatePoint;
  end: CreatePoint;
  /** line 约束下的拖动长度 */
  length?: number;
}

export const normalizeRect = (
  x1: number,
  y1: number,
  x2: number,
  y2: number
): CreateGeometry["rect"] => ({
  x: Math.min(x1, x2),
  y: Math.min(y1, y2),
  width: Math.abs(x2 - x1),
  height: Math.abs(y2 - y1),
});

/**
 * 应用拖动约束：box = Shift 等比（取 |dx|/|dy| 最大值保持方向）、Alt 以按下点为中心；
 * line = start 不变，Shift 时 end 吸附到最近的 45° 方向（保持长度），rect 为起止点包围盒。
 */
export function constrainCreateGeometry(
  constrain: "box" | "line",
  start: CreatePoint,
  point: CreatePoint,
  shift: boolean,
  alt: boolean
): CreateGeometry {
  if (constrain === "line") {
    let dx = point.x - start.x;
    let dy = point.y - start.y;
    const length = Math.hypot(dx, dy);
    if (shift && length > 0) {
      const step = Math.PI / 4;
      const snapped = Math.round(Math.atan2(dy, dx) / step) * step;
      dx = length * Math.cos(snapped);
      dy = length * Math.sin(snapped);
    }
    const end = { x: start.x + dx, y: start.y + dy };
    return {
      rect: normalizeRect(start.x, start.y, end.x, end.y),
      start: { ...start },
      end,
      length: Math.hypot(dx, dy),
    };
  }

  let dx = point.x - start.x;
  let dy = point.y - start.y;
  if (shift) {
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx) * size;
    dy = Math.sign(dy) * size;
  }
  const anchorX = alt ? start.x - dx : start.x;
  const anchorY = alt ? start.y - dy : start.y;
  const end = { x: start.x + dx, y: start.y + dy };
  return {
    rect: normalizeRect(anchorX, anchorY, end.x, end.y),
    start: { ...start },
    end,
  };
}
