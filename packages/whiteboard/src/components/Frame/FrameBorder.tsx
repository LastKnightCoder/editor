import { memo, useMemo } from "react";

import type { FrameBorderStyle } from "../../types";
import { fitDash, roundedRectPerimeter, roundedRectSides } from "../../utils/dash";
import type { DashFit, DashRhythm } from "../../utils/dash";
import SketchRect from "../SketchPaths/SketchRect";

/** 普通画风的线型节奏（随线宽缩放）：线宽 2 时虚线 8 实 6 空，点线每 5 一个点 */
const PLAIN_RHYTHM: Record<"dashed" | "dotted", (width: number) => DashRhythm> = {
  dashed: width => ({ visible: 4 * width, pitch: 7 * width }),
  dotted: width => ({ visible: 0, pitch: 2.5 * width }),
};

/** 拖入反馈的流动速度（画布单位 / 秒） */
const FLOW_SPEED = 24;

const f = (n: number) => Math.round(n * 100) / 100;

// jsdom 等环境可能没有 matchMedia，两处可选链都不能省
const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;

interface FrameBorderProps {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  color: string;
  borderWidth: number;
  borderStyle: FrameBorderStyle;
  dropping: boolean;
  sketchEnabled: boolean;
  sketchSeed: number;
}

/** 画框边框的视觉层：只负责描边，不接收指针事件，命中由 Frame 的底层 rect 承担 */
const FrameBorder = memo(
  ({
    x,
    y,
    width,
    height,
    radius,
    color,
    borderWidth,
    borderStyle,
    dropping,
    sketchEnabled,
    sketchSeed,
  }: FrameBorderProps) => {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));

    // 拖入反馈：线宽 +1，整圈一条虚线顺时针流动；实线框借用虚线节奏
    const flow = useMemo(() => {
      if (!dropping) return null;
      const strokeWidth = borderWidth + 1;
      const fit = fitDash(
        roundedRectPerimeter(width, height, radius),
        PLAIN_RHYTHM[borderStyle === "dotted" ? "dotted" : "dashed"](strokeWidth),
        strokeWidth
      );
      return { strokeWidth, fit };
    }, [dropping, borderWidth, width, height, radius, borderStyle]);

    // 普通画风虚线 / 点线：逐边贴合节奏，每条边以半段墨起止，角上永远有墨
    const dashedSides = useMemo(() => {
      if (dropping || sketchEnabled || borderStyle === "solid") return null;
      const rhythm = PLAIN_RHYTHM[borderStyle](borderWidth);
      const fits: { d: string; fit: DashFit }[] = [];
      for (const side of roundedRectSides(width, height, radius)) {
        fits.push({ d: side.d, fit: fitDash(side.length, rhythm, borderWidth) });
      }
      return fits;
    }, [dropping, sketchEnabled, borderStyle, borderWidth, width, height, radius]);

    if (!dropping && borderWidth <= 0) return null;

    if (dropping && flow) {
      return (
        <g transform={`translate(${x} ${y})`} pointerEvents="none">
          <rect
            width={width}
            height={height}
            rx={r}
            ry={r}
            fill="none"
            stroke={color}
            strokeWidth={flow.strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${f(flow.fit.dash)} ${f(flow.fit.gap)}`}
          >
            {!prefersReducedMotion() && (
              <animate
                attributeName="stroke-dashoffset"
                from="0"
                to={f(-flow.fit.pitch)}
                dur={`${f(flow.fit.pitch / FLOW_SPEED)}s`}
                repeatCount="indefinite"
              />
            )}
          </rect>
        </g>
      );
    }

    if (sketchEnabled) {
      return (
        <SketchRect
          x={x}
          y={y}
          width={width}
          height={height}
          radius={radius}
          stroke={color}
          strokeWidth={borderWidth}
          strokeDash={borderStyle === "solid" ? undefined : borderStyle}
          level="neat"
          seed={sketchSeed}
        />
      );
    }

    if (borderStyle === "solid") {
      return (
        <g transform={`translate(${x} ${y})`} pointerEvents="none">
          <rect
            width={width}
            height={height}
            rx={r}
            ry={r}
            fill="none"
            stroke={color}
            strokeWidth={borderWidth}
          />
        </g>
      );
    }

    return (
      <g transform={`translate(${x} ${y})`} pointerEvents="none">
        {dashedSides?.map((side, index) => (
          <path
            key={index}
            d={side.d}
            fill="none"
            stroke={color}
            strokeWidth={borderWidth}
            strokeLinecap="round"
            strokeDasharray={`${f(side.fit.dash)} ${f(side.fit.gap)}`}
            strokeDashoffset={f(side.fit.dash / 2)}
          />
        ))}
      </g>
    );
  }
);

FrameBorder.displayName = "FrameBorder";

export default FrameBorder;
