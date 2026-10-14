import { STICK_INK, STICK_PAPER } from "../../constants/stickman";
import type { SketchLevel } from "../../types/sketch";
import { polylineToD, resample, wobble, type Vec } from "../sketch/geometry";
import { inkOutline } from "../sketch/ink";
import { inkSize } from "../sketch/levels";
import { createRandom } from "../sketch/random";
import { loopStroke } from "../sketch/shape";
import type { SketchPath } from "../sketch/types";
import type { StickStroke } from "./types";

/** 普通画风的 SVG 路径：线一律圆头圆角 */
export interface StickSvgPath {
  d: string;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface StickText {
  x: number;
  y: number;
  text: string;
  size: number;
  /** 手绘时每个字略微歪一点（度） */
  rotate?: number;
}

/**
 * 人物尺寸只有一百来个单位，摆动幅度、端点抖动与波长都比形状引擎小一档；
 * 档位与页级「工整 / 自然 / 潦草」一一对应。
 */
const STICK_WOBBLE: Record<SketchLevel, { amplitude: number; jitter: number }> = {
  neat: { amplitude: 0.45, jitter: 0.5 },
  natural: { amplitude: 1, jitter: 1.2 },
  loose: { amplitude: 1.8, jitter: 2.2 },
};
const STICK_WAVE_SCALE = 0.55;
/** 粗线（象形形体）少渐细，端头保持圆钝 */
const THICK_LINE = 6;

const closed = (points: Vec[]): Vec[] => [...points, points[0]];

export function renderStickPrecise(strokes: StickStroke[]) {
  const paths: StickSvgPath[] = [];
  const texts: StickText[] = [];
  for (const stroke of strokes) {
    if (stroke.kind === "text") {
      texts.push({ x: stroke.x, y: stroke.y, text: stroke.text, size: stroke.size });
    } else if (stroke.kind === "line") {
      paths.push({
        d: polylineToD(stroke.points),
        fill: "none",
        stroke: STICK_INK,
        strokeWidth: stroke.width,
      });
    } else {
      paths.push({
        d: polylineToD(stroke.points, true),
        fill: stroke.fill === "ink" ? STICK_INK : (stroke.fill ?? "none"),
        stroke: stroke.width ? STICK_INK : undefined,
        strokeWidth: stroke.width,
      });
    }
  }
  return { paths, texts };
}

/** 手绘画风：墨迹与填充都是填充多边形（SketchPaths 渲染），同一 seed 永远同一笔 */
export function renderStickSketch(strokes: StickStroke[], level: SketchLevel, seed: number) {
  const random = createRandom(seed);
  const { amplitude, jitter } = STICK_WOBBLE[level];
  const shake = (p: Vec): Vec => [
    p[0] + (random() - 0.5) * 2 * jitter,
    p[1] + (random() - 0.5) * 2 * jitter,
  ];
  const paths: SketchPath[] = [];
  const texts: StickText[] = [];

  for (const stroke of strokes) {
    if (stroke.kind === "text") {
      texts.push({
        x: stroke.x,
        y: stroke.y,
        text: stroke.text,
        size: stroke.size * 1.15,
        rotate: Math.round((random() - 0.5) * 800) / 100,
      });
      continue;
    }
    if (stroke.kind === "line") {
      const points = wobble(
        resample(stroke.points.map(shake), 2.5),
        amplitude,
        random,
        STICK_WAVE_SCALE
      );
      const w = stroke.width;
      const options =
        w >= THICK_LINE
          ? { thinning: 0.22, taperStart: w * 0.3, taperEnd: w * 0.8 }
          : { taperStart: w * 1.2, taperEnd: w * 3 };
      paths.push({
        role: "ink",
        d: inkOutline(points, inkSize(w), random, options),
        color: STICK_INK,
      });
      continue;
    }

    const ring = resample(closed(stroke.points), 2.5);
    if (stroke.fill === "ink") {
      const d = polylineToD(wobble(ring, amplitude * 0.5, random, STICK_WAVE_SCALE), true);
      paths.push({ role: "ink", d, color: STICK_INK });
      continue;
    }
    if (stroke.fill) {
      // 着色错位半笔，像马克笔没对准线稿；纸色只负责遮挡，不错位
      const offset: Vec =
        stroke.fill === STICK_PAPER
          ? [0, 0]
          : [(random() - 0.2) * 2 * jitter, (random() - 0.2) * 2 * jitter];
      const fillRing = wobble(ring, amplitude * 0.6, random, STICK_WAVE_SCALE).map((p): Vec => [
        p[0] + offset[0],
        p[1] + offset[1],
      ]);
      paths.push({ role: "wash", d: polylineToD(fillRing, true), color: stroke.fill });
    }
    if (stroke.width) {
      const d = inkOutline(
        loopStroke(closed(stroke.points), amplitude * 0.7, random),
        inkSize(stroke.width),
        random
      );
      paths.push({ role: "ink", d, color: STICK_INK });
    }
  }
  return { paths, texts };
}
