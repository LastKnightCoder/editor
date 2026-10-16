export type Vec = [number, number];

export interface Polyline {
  points: Vec[];
  closed: boolean;
}

export const distance = (a: Vec, b: Vec) => Math.hypot(b[0] - a[0], b[1] - a[1]);

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function lengthOf(points: Vec[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i]);
  return total;
}

const round = (n: number) => Math.round(n * 100) / 100;

export const polylineToD = (points: Vec[], closed = false) =>
  points.length === 0
    ? ""
    : "M" + points.map(p => `${round(p[0])} ${round(p[1])}`).join(" L") + (closed ? " Z" : "");

/** 按弧长等距重采样，首尾点保留 */
export function resample(points: Vec[], step: number): Vec[] {
  if (points.length < 2) return points.map(p => [p[0], p[1]]);
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + distance(points[i - 1], points[i]));
  }
  const total = cumulative[cumulative.length - 1];
  if (total === 0) return [points[0], points[points.length - 1]].map(p => [p[0], p[1]]);
  const count = Math.max(2, Math.ceil(total / step));
  const result: Vec[] = [];
  let j = 1;
  for (let k = 0; k <= count; k++) {
    const target = (total * k) / count;
    while (j < cumulative.length - 1 && cumulative[j] < target) j++;
    const a = points[j - 1];
    const b = points[j];
    const segment = cumulative[j] - cumulative[j - 1] || 1;
    const t = (target - cumulative[j - 1]) / segment;
    result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return result;
}

/**
 * 沿法线方向的低频摆动：两段正弦按弧长叠加，相位由 random 决定。
 * 摆动是弧长的连续函数，端点移动时线形连续变化，不会整体跳变。
 * waveScale 缩放波长：尺寸很小的图形（火柴人等）传 <1，否则一整笔都落在半个波长内、看不出手抖。
 */
export function wobble(
  points: Vec[],
  amplitude: number,
  random: () => number,
  waveScale = 1
): Vec[] {
  const longWave = (Math.PI * 2) / ((110 + random() * 90) * waveScale);
  const shortWave = (Math.PI * 2) / ((28 + random() * 18) * waveScale);
  const longPhase = random() * Math.PI * 2;
  const shortPhase = random() * Math.PI * 2;
  if (amplitude <= 0) return points.map(p => [p[0], p[1]]);
  let arc = 0;
  return points.map((p, i) => {
    if (i > 0) arc += distance(points[i - 1], p);
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    const offset =
      amplitude *
      (0.72 * Math.sin(arc * longWave + longPhase) + 0.28 * Math.sin(arc * shortWave + shortPhase));
    return [p[0] - (dy / len) * offset, p[1] + (dx / len) * offset];
  });
}

function cubicPoint(p0: Vec, c1: Vec, c2: Vec, p3: Vec, t: number): Vec {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1],
  ];
}

const curveSteps = (approxLength: number) => clamp(Math.ceil(approxLength / 4), 4, 64);

/** SVG 椭圆弧（端点参数）→ 折线，按规范 F.6.5 换算圆心参数 */
function arcPoints(
  from: Vec,
  rxIn: number,
  ryIn: number,
  rotationDeg: number,
  largeArc: boolean,
  sweep: boolean,
  to: Vec
): Vec[] {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0 || (from[0] === to[0] && from[1] === to[1])) return [to];
  const phi = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from[0] - to[0]) / 2;
  const dy = (from[1] - to[1]) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const factor =
    (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / (denominator || 1)));
  const cx1 = (factor * rx * y1) / ry;
  const cy1 = (-factor * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (from[0] + to[0]) / 2;
  const cy = sin * cx1 + cos * cy1 + (from[1] + to[1]) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const sign = ux * vy - uy * vx < 0 ? -1 : 1;
    const dot = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1);
    return sign * Math.acos(clamp(dot, -1, 1));
  };
  const start = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && delta > 0) delta -= Math.PI * 2;
  if (sweep && delta < 0) delta += Math.PI * 2;
  const steps = curveSteps(Math.abs(delta) * Math.max(rx, ry));
  const result: Vec[] = [];
  for (let i = 1; i <= steps; i++) {
    const theta = start + (delta * i) / steps;
    const ex = rx * Math.cos(theta);
    const ey = ry * Math.sin(theta);
    result.push([cos * ex - sin * ey + cx, sin * ex + cos * ey + cy]);
  }
  result[result.length - 1] = [to[0], to[1]];
  return result;
}

const PARAM_COUNT: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};

/**
 * SVG path d → 折线（每个子路径一条），支持 M/L/H/V/C/S/Q/T/A/Z 的绝对与相对形式。
 * 白板里的几何轮廓与连线路径（ArrowUtil.getArrowPath）都只用到这些命令。
 */
export function flattenPath(d: string): Polyline[] {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  const result: Polyline[] = [];
  let current: Vec[] = [];
  let pos: Vec = [0, 0];
  let start: Vec = [0, 0];
  let lastControl: Vec | null = null;
  let lastCommand = "";
  let i = 0;

  const flush = (closed: boolean) => {
    if (current.length > 1) result.push({ points: current, closed });
    current = [];
  };
  const num = () => parseFloat(tokens[i++]);

  while (i < tokens.length) {
    let command = tokens[i];
    if (/[a-zA-Z]/.test(command)) {
      i++;
    } else {
      // 省略命令字母的重复参数：M 之后的隐式命令是 L
      command = lastCommand === "M" ? "L" : lastCommand === "m" ? "l" : lastCommand;
    }
    const upper = command.toUpperCase();
    if (!(upper in PARAM_COUNT)) break;
    const relative = command !== upper && upper !== "Z";
    const base: Vec = relative ? pos : [0, 0];
    const point = (): Vec => [base[0] + num(), base[1] + num()];

    if (upper === "Z") {
      if (current.length) current.push([start[0], start[1]]);
      flush(true);
      pos = start;
      lastControl = null;
      lastCommand = command;
      continue;
    }
    if (i + PARAM_COUNT[upper] > tokens.length) break;

    switch (upper) {
      case "M": {
        flush(false);
        pos = point();
        start = pos;
        current = [pos];
        lastControl = null;
        break;
      }
      case "L":
      case "H":
      case "V": {
        const next: Vec =
          upper === "L"
            ? point()
            : upper === "H"
              ? [(relative ? pos[0] : 0) + num(), pos[1]]
              : [pos[0], (relative ? pos[1] : 0) + num()];
        if (!current.length) current.push(pos);
        current.push(next);
        pos = next;
        lastControl = null;
        break;
      }
      case "C":
      case "S": {
        const c1: Vec =
          upper === "S"
            ? lastControl && /[CcSs]/.test(lastCommand)
              ? [2 * pos[0] - lastControl[0], 2 * pos[1] - lastControl[1]]
              : pos
            : point();
        const c2 = point();
        const end = point();
        const steps = curveSteps(distance(pos, c1) + distance(c1, c2) + distance(c2, end));
        if (!current.length) current.push(pos);
        for (let s = 1; s <= steps; s++) current.push(cubicPoint(pos, c1, c2, end, s / steps));
        lastControl = c2;
        pos = end;
        break;
      }
      case "Q":
      case "T": {
        const control: Vec =
          upper === "T"
            ? lastControl && /[QqTt]/.test(lastCommand)
              ? [2 * pos[0] - lastControl[0], 2 * pos[1] - lastControl[1]]
              : pos
            : point();
        const end = point();
        const c1: Vec = [
          pos[0] + (2 / 3) * (control[0] - pos[0]),
          pos[1] + (2 / 3) * (control[1] - pos[1]),
        ];
        const c2: Vec = [
          end[0] + (2 / 3) * (control[0] - end[0]),
          end[1] + (2 / 3) * (control[1] - end[1]),
        ];
        const steps = curveSteps(distance(pos, control) + distance(control, end));
        if (!current.length) current.push(pos);
        for (let s = 1; s <= steps; s++) current.push(cubicPoint(pos, c1, c2, end, s / steps));
        lastControl = control;
        pos = end;
        break;
      }
      case "A": {
        const rx = num();
        const ry = num();
        const rotation = num();
        const largeArc = num() !== 0;
        const sweep = num() !== 0;
        const end = point();
        if (!current.length) current.push(pos);
        current.push(...arcPoints(pos, rx, ry, rotation, largeArc, sweep, end));
        lastControl = null;
        pos = end;
        break;
      }
    }
    lastCommand = command;
  }
  flush(false);
  return result;
}
