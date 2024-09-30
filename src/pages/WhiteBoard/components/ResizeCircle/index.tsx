import { EHandlerPosition, Point } from "../../types";
import { PointUtil } from "../../utils";
import { useResize } from '../../hooks';
import { useRef } from "react";
import { useThrottleFn } from "ahooks";

interface ResizeCircleProps {
  position: EHandlerPosition;
  cx: number;
  cy: number;
  r: number;
  fill: string;
  onResizeStart?: (startPoint: Point) => void;
  onResize: (position: EHandlerPosition, startPoint: Point, endPoint: Point) => void;
  onResizeEnd?: (startPoint: Point, endPoint: Point) => void;
}

const ResizeCircle = (props: ResizeCircleProps) => {
  const { position, cx, cy, r, fill, onResizeStart, onResize, onResizeEnd } = props;

  const ref = useRef<SVGCircleElement>(null);

  const { run: handleOnResize } = useThrottleFn((startPoint: Point, endPoint: Point) => {
    onResize(position, startPoint, endPoint);
  }, { wait: 20 });

  useResize({
    ref,
    onResizeStart,
    onResize: handleOnResize,
    onResizeEnd
  })

  return (
    <circle
      ref={ref}
      style={{
        cursor: PointUtil.getResizeCursor(position as EHandlerPosition)
      }}
      cx={cx}
      cy={cy}
      r={r}
      fill={fill}
    />
  )
}

export default ResizeCircle;
