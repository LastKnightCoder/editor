import { memo } from "react";

import { EMarkerType, Point, EArrowLineType } from "../../types";
import { ArrowUtil } from "@/components/WhiteBoard/utils";

interface ArrowProps {
  sourceMarker: EMarkerType;
  targetMarker: EMarkerType;
  lineType: EArrowLineType;
  lineColor: string;
  lineWidth: number;
  points: Point[];
  sourceConnectId?: string;
  targetConnectId?: string;
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

const Arrow = memo((props: ArrowProps) => {
  const { sourceMarker, targetMarker, lineColor, lineWidth } = props;
  return (
    <path
      d={ArrowUtil.getArrowPath(props)}
      stroke={lineColor}
      strokeWidth={lineWidth}
      fill={"none"}
      markerEnd={
        targetMarker !== EMarkerType.None ? getMarkerUrl(targetMarker) : "none"
      }
      markerStart={
        sourceMarker !== EMarkerType.None ? getMarkerUrl(sourceMarker) : "none"
      }
    />
  );
});

export default Arrow;
