import type { SketchFillStyle, SketchLevel } from "../../types/sketch";
import { fitDash, roundedRectSides, type DashRhythm } from "../dash";
import {
  clamp,
  distance,
  flattenPath,
  lengthOf,
  polylineToD,
  resample,
  wobble,
  type Polyline,
  type Vec,
} from "./geometry";
import { inkOutline } from "./ink";
import { WOBBLE_AMPLITUDE, inkSize } from "./levels";
import { createRandom } from "./random";
import type { SketchPath } from "./types";

export type SketchOutline =
  | { kind: "rect"; cornerRadius?: number }
  | { kind: "ellipse" }
  /** 已缩放到元素尺寸的 path d（几何配置经 transformPath 的结果） */
  | { kind: "path"; paths: string[] };

export interface SketchShapeInput {
  outline: SketchOutline;
  width: number;
  height: number;
  stroke?: string;
  strokeWidth: number;
  strokeOpacity?: number;
  fill?: string;
  fillOpacity?: number;
  fillStyle?: SketchFillStyle;
  /** 描边线型：只对圆角矩形生效；缺省实线 */
  strokeDash?: "dashed" | "dotted";
  /** 淡涂叠在纸上的不透明度系数，缺省 WASH_ALPHA；底色承载文字对比度时（导图节点）传 1 */
  washAlpha?: number;
  level: SketchLevel;
  seed: number;
}

/** 淡涂叠在纸上的不透明度系数（再乘元素自身的 fillOpacity） */
const WASH_ALPHA = 0.7;
const HATCH_ANGLE = -41;

/** 手绘虚线 / 点线的节奏（随线宽缩放）：段比普通画风更长、更疏，像笔一段段画出来 */
const SKETCH_DASH_RHYTHM: Record<"dashed" | "dotted", (strokeWidth: number) => DashRhythm> = {
  dashed: w => ({ visible: 7 * w, pitch: 11.5 * w }),
  dotted: w => ({ visible: 0, pitch: 5 * w }),
};

function roundedRect(width: number, height: number, radius: number): Vec[] {
  const r = Math.min(radius, width / 2, height / 2);
  if (r <= 0) {
    return [
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
      [0, 0],
    ];
  }
  const points: Vec[] = [];
  const corner = (cx: number, cy: number, startAngle: number) => {
    for (let i = 0; i <= 8; i++) {
      const a = startAngle + (Math.PI / 2) * (i / 8);
      points.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  corner(width - r, r, -Math.PI / 2);
  corner(width - r, height - r, 0);
  corner(r, height - r, Math.PI / 2);
  corner(r, r, Math.PI);
  points.push([points[0][0], points[0][1]]);
  return points;
}

function ellipse(width: number, height: number): Vec[] {
  const points: Vec[] = [];
  for (let i = 0; i <= 72; i++) {
    const a = -Math.PI / 2 + (Math.PI * 2 * i) / 72;
    points.push([width / 2 + (width / 2) * Math.cos(a), height / 2 + (height / 2) * Math.sin(a)]);
  }
  return points;
}

export function outlinePolylines(
  outline: SketchOutline,
  width: number,
  height: number
): Polyline[] {
  if (outline.kind === "rect") {
    return [{ points: roundedRect(width, height, outline.cornerRadius ?? 0), closed: true }];
  }
  if (outline.kind === "ellipse") return [{ points: ellipse(width, height), closed: true }];
  return outline.paths.flatMap(d =>
    flattenPath(d).map(line => {
      const first = line.points[0];
      const last = line.points[line.points.length - 1];
      return { points: line.points, closed: line.closed || distance(first, last) < 0.5 };
    })
  );
}

/** 闭合轮廓一笔绕一圈：随机起点，末尾一小段向外搭接，形成手绘的收口 */
export function loopStroke(
  loop: Vec[],
  amplitude: number,
  random: () => number,
  overlapRatio = 0.06
): Vec[] {
  const base = resample(loop, 3);
  base.pop();
  const count = base.length;
  if (count < 3) return wobble(loop, amplitude, random);
  const startIndex = Math.floor(random() * count);
  const ring = base.slice(startIndex).concat(base.slice(0, startIndex));
  const perimeter = lengthOf(ring);
  const overlapCount = Math.max(
    4,
    Math.round((count * Math.max(12, perimeter * overlapRatio)) / perimeter)
  );
  const cx = ring.reduce((sum, p) => sum + p[0], 0) / count;
  const cy = ring.reduce((sum, p) => sum + p[1], 0) / count;
  const drift = 1.5 + amplitude;
  const tail = ring.slice(0, overlapCount).map((p, i): Vec => {
    const dx = p[0] - cx;
    const dy = p[1] - cy;
    const len = Math.hypot(dx, dy) || 1;
    const k = (i / overlapCount) * drift;
    return [p[0] + (dx / len) * k, p[1] + (dy / len) * k];
  });
  return wobble(ring.concat([ring[0]], tail), amplitude, random);
}

/** 手绘虚线 / 点线矩形：无搭接的一笔闭合墨迹 × 逐边虚线遮罩，起笔接缝藏进上边中段的空隙 */
function dashedRectStroke(
  width: number,
  height: number,
  radius: number,
  style: "dashed" | "dotted",
  stroke: string,
  input: SketchShapeInput,
  random: () => number
): SketchPath {
  const { strokeWidth, level } = input;
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  const size = inkSize(strokeWidth);
  const maskWidth = style === "dotted" ? size * 1.3 : size * 3;
  const sides = roundedRectSides(width, height, r);
  const fits = sides.map(s => fitDash(s.length, SKETCH_DASH_RHYTHM[style](strokeWidth), maskWidth));
  const seamX = r - (Math.PI * r) / 4 + (Math.floor((fits[0].count - 1) / 2) + 0.5) * fits[0].pitch;
  const base = resample(roundedRect(width, height, r), 3);
  base.pop();
  let si = 0;
  base.forEach((p, i) => {
    if (distance(p, [seamX, 0]) < distance(base[si], [seamX, 0])) si = i;
  });
  const ring = base.slice(si).concat(base.slice(0, si));
  ring.push(ring[0]);
  const d = inkOutline(wobble(ring, WOBBLE_AMPLITUDE[level], random), size, random, {
    taperStart: 0,
    taperEnd: 0,
  });
  return {
    role: "ink",
    d,
    color: stroke,
    opacity: input.strokeOpacity,
    dashMask: sides.map((s, i) => ({
      d: s.d,
      width: maskWidth,
      dash: fits[i].dash,
      gap: fits[i].gap,
      offset: fits[i].dash / 2,
    })),
  };
}

/** 覆盖 width×height 的平行线，angle 为排线方向（度） */
function hatchLines(
  width: number,
  height: number,
  gap: number,
  angle: number,
  random: () => number
): Vec[][] {
  const rad = (angle * Math.PI) / 180;
  const dir: Vec = [Math.cos(rad), Math.sin(rad)];
  const normal: Vec = [-dir[1], dir[0]];
  const radius = Math.hypot(width, height) / 2 + 4;
  const lines: Vec[][] = [];
  for (let offset = -radius + gap / 2; offset <= radius; offset += gap) {
    const jittered = offset + (random() - 0.5) * gap * 0.18;
    const cx = width / 2 + normal[0] * jittered;
    const cy = height / 2 + normal[1] * jittered;
    lines.push([
      [cx - dir[0] * radius, cy - dir[1] * radius],
      [cx + dir[0] * radius, cy + dir[1] * radius],
    ]);
  }
  return lines;
}

/** 排线间距随线宽变粗、随形状尺寸微调：大形状不稀、小形状不糊 */
export const hatchGap = (strokeWidth: number, width: number, height: number) =>
  clamp(3.5 + strokeWidth * 2.4, 5, 14) * clamp(Math.min(width, height) / 90, 0.8, 1.15);

function fillPaths(
  closedLoops: Vec[][],
  input: SketchShapeInput,
  color: string,
  random: () => number
): SketchPath[] {
  const { width, height, strokeWidth, level, fillOpacity = 1 } = input;
  const style = input.fillStyle ?? "solid";
  const amplitude = WOBBLE_AMPLITUDE[level];
  const clip = closedLoops.map(loop => polylineToD(loop, true)).join(" ");
  const gap = hatchGap(strokeWidth, width, height);

  if (style === "solid") {
    // 淡涂：轮廓外扩抖动 + 错位，像马克笔没对准线稿
    const shift = clamp(Math.min(width, height) * 0.04, 1.5, 3.5);
    const d = closedLoops
      .map(loop =>
        polylineToD(
          wobble(resample(loop, 4), 2.6 + amplitude, random).map(p => [
            p[0] + shift,
            p[1] + shift * 0.85,
          ]),
          true
        )
      )
      .join(" ");
    return [{ role: "wash", d, color, opacity: fillOpacity * (input.washAlpha ?? WASH_ALPHA) }];
  }

  if (style === "scribble") {
    const lines = hatchLines(width, height, gap * 1.3, HATCH_ANGLE, random);
    const zigzag: Vec[] = [];
    lines.forEach((line, i) => zigzag.push(...(i % 2 ? [line[1], line[0]] : line)));
    return [
      {
        role: "lines",
        d: inkOutline(wobble(resample(zigzag, 4), 1.2, random), gap * 0.6, random, {
          thinning: 0.2,
          taperStart: 0,
          taperEnd: 0,
        }),
        color,
        opacity: fillOpacity,
        clip,
      },
    ];
  }

  const angles = style === "cross" ? [HATCH_ANGLE, HATCH_ANGLE + 90] : [HATCH_ANGLE];
  const lineSize = Math.max(1.4, strokeWidth * 0.7);
  const d = angles
    .flatMap(angle => hatchLines(width, height, gap, angle, random))
    .map(line =>
      inkOutline(wobble(resample(line, 6), 0.6, random), lineSize, random, {
        taperStart: 6,
        taperEnd: 10,
      })
    )
    .join(" ");
  return [{ role: "lines", d, color, opacity: fillOpacity, clip }];
}

/** 形状的手绘渲染：填充在下、轮廓墨迹在上。坐标系为元素局部坐标（0,0 ~ width,height） */
export function sketchShape(input: SketchShapeInput): SketchPath[] {
  const { width, height, strokeWidth, level, seed, fill, stroke } = input;
  if (width <= 0 || height <= 0) return [];
  const random = createRandom(seed);
  const fillRandom = createRandom(seed * 31 + 3);
  const amplitude = WOBBLE_AMPLITUDE[level];
  const polylines = outlinePolylines(input.outline, width, height);
  const closedLoops = polylines.filter(line => line.closed).map(line => line.points);
  const result: SketchPath[] = [];

  if (fill && fill !== "none" && fill !== "transparent" && closedLoops.length) {
    result.push(...fillPaths(closedLoops, input, fill, fillRandom));
  }

  if (stroke && stroke !== "none" && stroke !== "transparent" && strokeWidth > 0) {
    if (input.strokeDash && input.outline.kind === "rect") {
      result.push(
        dashedRectStroke(
          width,
          height,
          input.outline.cornerRadius ?? 0,
          input.strokeDash,
          stroke,
          input,
          random
        )
      );
    } else {
      const size = inkSize(strokeWidth);
      const d = polylines
        .map(line =>
          line.closed
            ? inkOutline(loopStroke(line.points, amplitude, random), size, random, {
                taperStart: strokeWidth * 3,
                taperEnd: strokeWidth * 9,
              })
            : inkOutline(wobble(resample(line.points, 3), amplitude, random), size, random)
        )
        .join(" ");
      result.push({ role: "ink", d, color: stroke, opacity: input.strokeOpacity });
    }
  }
  return result;
}
