import { memo, useMemo } from "react";
import type { SketchFillStyle, SketchLevel } from "../../types";
import { sketchShape } from "../../utils/sketch";
import SketchPaths from ".";

interface SketchRectProps {
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
  stroke?: string;
  strokeWidth: number;
  fill?: string;
  fillOpacity?: number;
  fillStyle?: SketchFillStyle;
  washAlpha?: number;
  level: SketchLevel;
  seed: number;
}

/** 手绘圆角矩形框：画框、分栏、文本底板、导图节点共用；不接收指针事件，命中仍由原图形承担 */
const SketchRect = memo((props: SketchRectProps) => {
  const { x, y, width, height, radius = 0, stroke, strokeWidth } = props;
  const { fill, fillOpacity, fillStyle, washAlpha, level, seed } = props;
  const paths = useMemo(
    () =>
      sketchShape({
        outline: { kind: "rect", cornerRadius: radius },
        width,
        height,
        stroke,
        strokeWidth,
        fill,
        fillOpacity,
        fillStyle,
        washAlpha,
        level,
        seed,
      }),
    [
      width,
      height,
      radius,
      stroke,
      strokeWidth,
      fill,
      fillOpacity,
      fillStyle,
      washAlpha,
      level,
      seed,
    ]
  );
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      <SketchPaths paths={paths} />
    </g>
  );
});

export default SketchRect;
