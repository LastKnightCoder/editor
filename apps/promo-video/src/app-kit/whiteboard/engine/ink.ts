import { getStroke } from "perfect-freehand";
import { clamp, type Vec } from "./geometry";

export interface InkOptions {
  /** 起笔 / 收笔渐细长度（px），0 为平头 */
  taperStart?: number;
  taperEnd?: number;
  thinning?: number;
  streamline?: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** perfect-freehand 输出的轮廓点 → 二次曲线闭合 path */
function outlineToD(points: number[][]): string {
  if (points.length < 3) return "";
  let d = `M${round(points[0][0])} ${round(points[0][1])} Q`;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    d += ` ${round(x0)} ${round(y0)} ${round((x0 + x1) / 2)} ${round((y0 + y1) / 2)}`;
  }
  return d + " Z";
}

/**
 * 一笔墨迹的轮廓（填充多边形）：起笔略重、行笔饱满、收笔变细，压力带极小噪声。
 * size 为墨迹最大宽度。
 */
export function inkOutline(points: Vec[], size: number, random: () => number, options: InkOptions = {}): string {
  const count = points.length;
  const input = points.map((p, i) => {
    const t = i / Math.max(1, count - 1);
    const pressure = 0.62 + 0.3 * Math.sin(Math.PI * Math.min(1, t * 1.25)) - 0.22 * t + (random() - 0.5) * 0.05;
    return [p[0], p[1], clamp(pressure, 0.2, 1)];
  });
  return outlineToD(
    getStroke(input, {
      size,
      thinning: options.thinning ?? 0.5,
      smoothing: 0.55,
      streamline: options.streamline ?? 0.22,
      simulatePressure: false,
      start: { taper: options.taperStart ?? size * 1.5, cap: true },
      end: { taper: options.taperEnd ?? size * 4, cap: true },
      last: true,
    })
  );
}
