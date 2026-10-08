import { EArrowLineType, EMarkerType, Point, SketchLevel } from "../../types";
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

// 获取箭头标记的URL
const getMarkerUrl = (markerType: EMarkerType): string => {
  switch (markerType) {
    case EMarkerType.Arrow:
      return "url(#whiteboard-arrow)";
    case EMarkerType.OpenArrow:
      return "url(#whiteboard-open-arrow)";
    case EMarkerType.ClosedArrow:
      return "url(#whiteboard-closed-arrow)";
    case EMarkerType.Diamond:
      return "url(#whiteboard-diamond)";
    case EMarkerType.Circle:
      return "url(#whiteboard-circle)";
    case EMarkerType.None:
    default:
      return "none";
  }
};

const CurveArrow = (props: CurveArrowProps) => {
  const { sourceMarker, targetMarker, lineColor, lineWidth, forceVertical, sketch } = props;

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
        markerEnd={targetMarker !== EMarkerType.None ? getMarkerUrl(targetMarker) : "none"}
        markerStart={sourceMarker !== EMarkerType.None ? getMarkerUrl(sourceMarker) : "none"}
      />
    </g>
  );
};

export default CurveArrow;
