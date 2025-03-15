import { memo } from "react";

import { EMarkerType, Point, EArrowLineType } from "../../types";
import { ArrowUtil } from "@/components/WhiteBoard/utils";
import SketchArrow from "./SketchArrow";

interface ArrowProps {
  sourceMarker: EMarkerType;
  targetMarker: EMarkerType;
  lineType: EArrowLineType;
  lineColor: string;
  lineWidth: number;
  points: Point[];
  sourceConnectId?: string;
  targetConnectId?: string;
  sketchEnabled?: boolean;
  roughness?: number;
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
  const {
    sourceMarker,
    targetMarker,
    lineColor,
    lineWidth,
    sketchEnabled = false,
    roughness = 1,
  } = props;

  // 如果启用了草图风格，使用 SketchArrow 组件
  if (sketchEnabled) {
    return (
      <SketchArrow {...props} sketchEnabled={true} roughness={roughness} />
    );
  }

  // 否则使用普通箭头渲染
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
