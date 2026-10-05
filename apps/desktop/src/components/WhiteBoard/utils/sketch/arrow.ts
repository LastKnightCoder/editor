import { EMarkerType } from "../../types/arrow";
import type { SketchLevel } from "../../types/sketch";
import { clamp, distance, flattenPath, polylineToD, resample, wobble, type Vec } from "./geometry";
import { inkOutline } from "./ink";
import { WOBBLE_AMPLITUDE, inkSize } from "./levels";
import { createRandom } from "./random";
import { loopStroke } from "./shape";
import type { SketchPath } from "./types";

export interface SketchArrowInput {
  /** 连线中心线（ArrowUtil.getArrowPath 的输出，画布坐标） */
  d: string;
  color: string;
  strokeWidth: number;
  dashed?: boolean;
  dashArray?: number[];
  sourceMarker: EMarkerType;
  targetMarker: EMarkerType;
  level: SketchLevel;
  seed: number;
}

export interface SketchArrowOutput {
  paths: SketchPath[];
  /** 摆动后的中心线：流动点沿它运动，虚线遮罩也沿它描 */
  centerline: string;
}

/** 端点标记长度：随线宽增长，封顶避免粗线配大黑三角 */
export const markerLength = (strokeWidth: number) => clamp(9 + strokeWidth * 2.6, 10, 22);

/** 取距端点约 14px 处的切线作方向，避免曲线末端的抖动带偏方向 */
function endDirection(points: Vec[], atEnd: boolean) {
  const dense = resample(points, 2);
  const tip = atEnd ? dense[dense.length - 1] : dense[0];
  const k = Math.min(dense.length - 1, 7);
  const ref = atEnd ? dense[dense.length - 1 - k] : dense[k];
  const len = distance(ref, tip) || 1;
  return { tip, ux: (tip[0] - ref[0]) / len, uy: (tip[1] - ref[1]) / len };
}

function marker(
  type: EMarkerType,
  points: Vec[],
  atEnd: boolean,
  input: SketchArrowInput,
  random: () => number
): SketchPath[] {
  if (type === EMarkerType.None) return [];
  const { color, strokeWidth, level } = input;
  const { tip, ux, uy } = endDirection(points, atEnd);
  const length = markerLength(strokeWidth);
  const size = inkSize(strokeWidth);
  // 局部坐标：沿方向 along（向后为负）、垂直方向 across
  const at = (along: number, across: number): Vec => [
    tip[0] + ux * along - uy * across,
    tip[1] + uy * along + ux * across,
  ];
  const spread = 0.5 + (random() - 0.5) * 0.12;
  const back = -length * Math.cos(spread);
  const side = length * Math.sin(spread);

  switch (type) {
    case EMarkerType.Arrow:
    case EMarkerType.OpenArrow:
      // 开口两翼一笔：左翼 → 尖 → 右翼
      return [
        {
          role: "ink",
          d: inkOutline(resample([at(back, side), tip, at(back, -side)], 2), size, random, {
            taperStart: size * 1.6,
            taperEnd: size * 2.4,
            streamline: 0.12,
          }),
          color,
        },
      ];
    case EMarkerType.ClosedArrow: {
      const triangle = [tip, at(back, -side), at(back, side), tip];
      const amplitude = WOBBLE_AMPLITUDE[level] * 0.4;
      return [
        { role: "wash", d: polylineToD(triangle, true), color },
        {
          role: "ink",
          d: inkOutline(loopStroke(triangle, amplitude, random, 0.04), size, random, {
            taperStart: size,
            taperEnd: size * 2,
          }),
          color,
        },
      ];
    }
    case EMarkerType.Diamond:
    case EMarkerType.Circle: {
      const half = length / 2;
      const outline: Vec[] = [];
      if (type === EMarkerType.Diamond) {
        outline.push(tip, at(-half, half * 0.6), at(-length, 0), at(-half, -half * 0.6), tip);
      } else {
        for (let i = 0; i <= 36; i++) {
          const a = (Math.PI * 2 * i) / 36;
          outline.push(at(-half + half * Math.cos(a), half * Math.sin(a)));
        }
      }
      return [
        { role: "wash", d: polylineToD(outline, true), color },
        {
          role: "ink",
          d: inkOutline(
            loopStroke(outline, WOBBLE_AMPLITUDE[level] * 0.4, random, 0.04),
            size,
            random,
            {
              taperStart: size,
              taperEnd: size * 2,
            }
          ),
          color,
        },
      ];
    }
    default:
      return [];
  }
}

/**
 * 连线的手绘渲染。线身始终是一笔连续墨迹；虚线由遮罩切段（dashMask），
 * 所以虚线与流动动画都不需要重算墨迹。
 */
export function sketchArrow(input: SketchArrowInput): SketchArrowOutput {
  const { d, color, strokeWidth, level, seed, dashed } = input;
  const lines = flattenPath(d);
  const points = lines.flatMap((line, i) => (i === 0 ? line.points : line.points.slice(1)));
  if (points.length < 2) return { paths: [], centerline: "" };

  const random = createRandom(seed);
  const size = inkSize(strokeWidth);
  const body = wobble(resample(points, 3), WOBBLE_AMPLITUDE[level] * 0.55, random);
  const centerline = polylineToD(body);

  const bodyPath: SketchPath = {
    role: "ink",
    d: inkOutline(body, size, random, { taperStart: size * 2, taperEnd: size * 1.2 }),
    color,
  };
  if (dashed) {
    const [dashBase = 5, gapBase = 5] = input.dashArray ?? [];
    // 手绘段比普通虚线略长，空隙要扣掉圆头遮罩向两侧伸出的部分
    const maskWidth = size * 3;
    bodyPath.dashMask = {
      d: centerline,
      width: maskWidth,
      dash: Math.max(dashBase, strokeWidth * 4 + 7),
      gap: Math.max(gapBase, strokeWidth * 2.5 + 4) + maskWidth,
    };
  }

  return {
    paths: [
      bodyPath,
      ...marker(input.targetMarker, body, true, input, random),
      ...marker(input.sourceMarker, body, false, input, random),
    ],
    centerline,
  };
}
