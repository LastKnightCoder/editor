import { EArrowLineType, EMarkerType, Point, SketchLevel } from "../../types";
import { useArrowMarkers } from "../ArrowMarkers/useArrowMarkers";
import { ArrowUtil } from "../../utils";
import SketchStroke from "../SketchPaths/SketchStroke";

interface CurveArrowProps {
  sourceMarker: EMarkerType;
  targetMarker: EMarkerType;
  lineColor: string;
  lineWidth: number;
  points: Point[];
  forceVertical?: boolean;
  /** 手绘时传入（思维导图分支线），只画线身，不画端点 */
  sketch?: { level: SketchLevel; seed: number };
}

const CurveArrow = (props: CurveArrowProps) => {
  const { sourceMarker, targetMarker, lineColor, lineWidth, forceVertical, sketch } = props;

  const markers = useArrowMarkers(sourceMarker, targetMarker);

  if (sketch) {
    return (
      <SketchStroke
        d={ArrowUtil.getArrowPath({ ...props, lineType: EArrowLineType.CURVE }, forceVertical)}
        color={lineColor}
        strokeWidth={lineWidth}
        level={sketch.level}
        seed={sketch.seed}
      />
    );
  }

  return (
    <g>
      <path
        d={ArrowUtil.getArrowPath({ ...props, lineType: EArrowLineType.CURVE }, forceVertical)}
        stroke={lineColor}
        strokeWidth={lineWidth}
        fill={"none"}
        {...markers}
      />
    </g>
  );
};

export default CurveArrow;
