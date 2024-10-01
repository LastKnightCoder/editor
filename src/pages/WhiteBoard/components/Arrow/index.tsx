import { memo } from 'react';
import If from "@/components/If";
import { EMarkerType, Point, EArrowLineType } from "../../types";

interface ArrowProps {
  sourceMarker: EMarkerType;
  targetMarker: EMarkerType;
  lineType: EArrowLineType;
  lineColor: string;
  lineWidth: number;
  points: Point[];
}

const Arrow = memo((props: ArrowProps) => {
  const { sourceMarker, targetMarker, lineColor, lineWidth, points, lineType } = props;
  return (
    <g>
      <If condition={lineType === EArrowLineType.STRAIGHT}>
        <polyline
          fill="none"
          points={points.map(p => `${p.x},${p.y}`).join(' ')}
          stroke={lineColor}
          strokeWidth={lineWidth}
          markerEnd={targetMarker !== EMarkerType.None ? `url(#whiteboard-arrow)` : 'none'}
          markerStart={sourceMarker !== EMarkerType.None ? `url(#whiteboard-arrow)` : 'none'}
        />
      </If>
    </g>
  )
});

export default Arrow;
