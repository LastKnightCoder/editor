import { EArrowLineType, EMarkerType, Point } from "../../types";
import { ArrowUtil } from '../../utils';

interface CurveArrowProps {
  sourceMarker: EMarkerType;
  targetMarker: EMarkerType;
  lineColor: string;
  lineWidth: number;
  points: Point[];
  forceVertical?: boolean;
}

const CurveArrow = (props: CurveArrowProps) => {
  const { sourceMarker, targetMarker, lineColor, lineWidth, forceVertical } = props;

  return (
    <g>
      <path
        d={ArrowUtil.getArrowPath({ ...props, lineType: EArrowLineType.CURVE }, forceVertical)}
        stroke={lineColor}
        strokeWidth={lineWidth}
        fill={'none'}
        markerEnd={targetMarker !== EMarkerType.None ? `url(#whiteboard-arrow)` : 'none'}
        markerStart={sourceMarker !== EMarkerType.None ? `url(#whiteboard-arrow)` : 'none'}
      />
    </g>
  )
}

export default CurveArrow;
