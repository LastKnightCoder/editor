import { memo } from 'react';

import { EMarkerType, Point, EArrowLineType } from "../../types";
import { ArrowUtil } from "@/components/WhiteBoard/utils";

interface ArrowProps {
  sourceMarker: EMarkerType;
  targetMarker: EMarkerType;
  lineType: EArrowLineType;
  lineColor: string;
  lineWidth: number;
  points: Point[];
}

const Arrow = memo((props: ArrowProps) => {
  const { sourceMarker, targetMarker, lineColor, lineWidth } = props;
  return (
    <path
      d={ArrowUtil.getArrowPath(props)}
      stroke={lineColor}
      strokeWidth={lineWidth}
      fill={'none'}
      markerEnd={targetMarker !== EMarkerType.None ? `url(#whiteboard-arrow)` : 'none'}
      markerStart={sourceMarker !== EMarkerType.None ? `url(#whiteboard-arrow)` : 'none'}
    />
  )
});

export default Arrow;
