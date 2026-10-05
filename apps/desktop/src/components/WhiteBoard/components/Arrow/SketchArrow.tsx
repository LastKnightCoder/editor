import { memo, useMemo } from "react";
import type { EMarkerType, ResolvedSketch } from "../../types";
import { inkSize, sketchArrow } from "../../utils/sketch";
import SketchPaths from "../SketchPaths";

interface SketchArrowProps {
  /** 中心线（ArrowUtil.getArrowPath 的输出） */
  d: string;
  sourceMarker: EMarkerType;
  targetMarker: EMarkerType;
  lineColor: string;
  lineWidth: number;
  sketch: ResolvedSketch;
  dashed?: boolean;
  dashArray?: number[];
  animated?: boolean;
  animationSpeed?: number;
}

/** 与普通模式的流动速度一致：虚线每秒走 10 × speed 像素 */
const DASH_PX_PER_SPEED = 10;

/**
 * 手绘连线：一笔连续墨迹 + 手绘端点。
 * 流动动画：虚线经遮罩 dashoffset 流动（墨迹不重算）；实线沿中心线跑流动点（D-106）。
 */
const SketchArrow = memo((props: SketchArrowProps) => {
  const { d, sourceMarker, targetMarker, lineColor, lineWidth, sketch } = props;
  const { dashed, dashArray, animated, animationSpeed = 3 } = props;
  const dashKey = dashArray?.join(",");

  const { paths, centerline, length } = useMemo(
    () =>
      sketchArrow({
        d,
        color: lineColor,
        strokeWidth: lineWidth,
        dashed,
        dashArray: dashKey ? dashKey.split(",").map(Number) : undefined,
        sourceMarker,
        targetMarker,
        level: sketch.level,
        seed: sketch.seed,
      }),
    [
      d,
      lineColor,
      lineWidth,
      dashed,
      dashKey,
      sourceMarker,
      targetMarker,
      sketch.level,
      sketch.seed,
    ]
  );

  const speed = animationSpeed || 3;
  const mask = paths[0]?.dashMask;
  const dashFlowDuration =
    animated && mask ? (mask.dash + mask.gap) / (DASH_PX_PER_SPEED * speed) : undefined;

  return (
    <g>
      <SketchPaths paths={paths} dashFlowDuration={dashFlowDuration} />
      {animated && !dashed && centerline && (
        <FlowDots
          path={centerline}
          length={length}
          color={lineColor}
          lineWidth={lineWidth}
          speed={speed}
        />
      )}
    </g>
  );
});

interface FlowDotsProps {
  path: string;
  length: number;
  color: string;
  lineWidth: number;
  speed: number;
}

/** 实线流动点：墨色实心点 + 一圈画布底色描边，同色墨线上也看得清；不用辉光滤镜 */
const FlowDots = memo(({ path, length, color, lineWidth, speed }: FlowDotsProps) => {
  const duration = 6 / speed;
  const count = Math.max(1, Math.min(4, Math.floor(length / 150)));
  const radius = inkSize(lineWidth) * 0.75 + 1;
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const begin = `${(-duration * i) / count}s`;
        return (
          <circle
            key={i}
            r={radius}
            fill={color}
            stroke="var(--tau-bg-surface)"
            strokeWidth={1.5}
            opacity={0}
            pointerEvents="none"
          >
            <animateMotion
              dur={`${duration}s`}
              repeatCount="indefinite"
              path={path}
              begin={begin}
            />
            <animate
              attributeName="opacity"
              values="0;1;1;0"
              keyTimes="0;0.12;0.85;1"
              dur={`${duration}s`}
              repeatCount="indefinite"
              begin={begin}
            />
          </circle>
        );
      })}
    </>
  );
});

export default SketchArrow;
