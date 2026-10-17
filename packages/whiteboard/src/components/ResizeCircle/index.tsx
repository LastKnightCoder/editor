import { useRef, memo } from "react";
import { useMemoizedFn } from "ahooks";

import { EHandlerPosition, Point } from "../../types";
import { PointUtil } from "../../utils";
import { useResize } from "../../hooks";

interface ResizeCircleProps {
  position: EHandlerPosition;
  cx: number;
  cy: number;
  r: number;
  fill: string;
  innerRadius?: number;
  innerFill?: string;
  onResizeStart?: (startPoint: Point) => void;
  onResize: (
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
    isPreserveRatio?: boolean,
    isAdsorb?: boolean
  ) => void;
  onResizeEnd?: (position: EHandlerPosition, startPoint: Point, endPoint: Point) => void;
}

const ResizeCircle = memo((props: ResizeCircleProps) => {
  const {
    position,
    cx,
    cy,
    r,
    innerRadius = r - 2,
    fill,
    innerFill = "var(--tau-bg-surface)",
    onResizeStart,
    onResize,
    onResizeEnd,
  } = props;

  const ref = useRef<SVGGElement>(null);

  const handleOnResize = useMemoizedFn(
    (startPoint: Point, endPoint: Point, isPreserveRatio?: boolean, isAdsorb?: boolean) => {
      onResize(position, startPoint, endPoint, isPreserveRatio, isAdsorb);
    }
  );

  const handleOnResizeEnd = useMemoizedFn((startPoint: Point, endPoint: Point) => {
    onResizeEnd?.(position, startPoint, endPoint);
  });

  useResize({
    ref,
    onResizeStart,
    onResize: handleOnResize,
    onResizeEnd: handleOnResizeEnd,
  });

  return (
    <g
      ref={ref}
      style={{
        cursor: PointUtil.getResizeCursor(position as EHandlerPosition),
      }}
    >
      <circle cx={cx} cy={cy} r={r} fill={fill} />
      <circle cx={cx} cy={cy} r={innerRadius} fill={innerFill} />
      {/* 扩展选择范围 */}
      <circle cx={cx} cy={cy} r={r + 2} fill={"none"} />
    </g>
  );
});

export default ResizeCircle;
