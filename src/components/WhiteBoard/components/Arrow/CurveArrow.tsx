import { EArrowLineType, EMarkerType, Point } from "../../types";
import { ArrowUtil } from "../../utils";

interface CurveArrowProps {
  sourceMarker: EMarkerType;
  targetMarker: EMarkerType;
  lineColor: string;
  lineWidth: number;
  points: Point[];
  forceVertical?: boolean;
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
  const { sourceMarker, targetMarker, lineColor, lineWidth, forceVertical } =
    props;

  return (
    <g>
      <path
        d={ArrowUtil.getArrowPath(
          { ...props, lineType: EArrowLineType.CURVE },
          forceVertical,
        )}
        stroke={lineColor}
        strokeWidth={lineWidth}
        fill={"none"}
        markerEnd={
          targetMarker !== EMarkerType.None
            ? getMarkerUrl(targetMarker)
            : "none"
        }
        markerStart={
          sourceMarker !== EMarkerType.None
            ? getMarkerUrl(sourceMarker)
            : "none"
        }
      />
    </g>
  );
};

export default CurveArrow;
