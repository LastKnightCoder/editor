import { memo, useMemo } from "react";
import { EMarkerType, type SketchLevel } from "../../types";
import { sketchArrow } from "../../utils/sketch";
import SketchPaths from ".";

interface SketchStrokeProps {
  /** 中心线（画布坐标） */
  d: string;
  color: string;
  strokeWidth: number;
  level: SketchLevel;
  seed: number;
}

/** 无端点的手绘线：分栏标题分隔线、思维导图分支线 */
const SketchStroke = memo(({ d, color, strokeWidth, level, seed }: SketchStrokeProps) => {
  const paths = useMemo(
    () =>
      sketchArrow({
        d,
        color,
        strokeWidth,
        sourceMarker: EMarkerType.None,
        targetMarker: EMarkerType.None,
        level,
        seed,
      }).paths,
    [d, color, strokeWidth, level, seed]
  );
  return (
    <g pointerEvents="none">
      <SketchPaths paths={paths} />
    </g>
  );
});

export default SketchStroke;
