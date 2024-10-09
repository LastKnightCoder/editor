import { memo } from 'react';
import If from "@/components/If";
import CurveArrow from "./CurveArrow.tsx";
// import { useWhyDidYouUpdate } from 'ahooks';

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

  // useWhyDidYouUpdate('Arrow', props);

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
      <If condition={lineType === EArrowLineType.CURVE}>
        <CurveArrow
          points={points}
          lineColor={lineColor}
          lineWidth={lineWidth}
          sourceMarker={sourceMarker}
          targetMarker={targetMarker}
        />
      </If>
    </g>
  )
});

export default Arrow;
