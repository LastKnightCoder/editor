import { memo, useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import { If } from "@tau/ui";
import ResizeCircle from "../ResizeCircle";
import ArrowConnectPointGroup from "../ArrowConnectPointGroup";
import ArrowDropConnectPoint from "../ArrowDropConnectPoint";
import StickFigure from "./StickFigure";
import { Board, EHandlerPosition, Point } from "../../types";
import { PointUtil } from "../../utils";
import { getStickPose, stickViewBox } from "../../utils/stickman";
import { useBoard, useSelectState, useDropArrow, useSketch } from "../../hooks";
import type { StickmanElement } from "../../plugins/StickmanPlugin";
import {
  SELECT_RECT_STROKE,
  SELECT_RECT_STROKE_WIDTH,
  SELECT_RECT_FILL_OPACITY,
  RESIZE_CIRCLE_FILL,
  RESIZE_CIRCLE_RADIUS,
} from "../../constants";

/** 人物只按比例缩放（图形按 meet 适配元素框），所以只给四角手柄 */
const CORNERS = [
  EHandlerPosition.TopLeft,
  EHandlerPosition.TopRight,
  EHandlerPosition.BottomLeft,
  EHandlerPosition.BottomRight,
];

interface StickmanProps {
  element: StickmanElement;
  onResizeStart?: (element: StickmanElement, startPoint: Point) => void;
  onResize: (
    board: Board,
    element: StickmanElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
    isPreserveRatio?: boolean,
    isAdsorb?: boolean
  ) => void;
  onResizeEnd?: (board: Board) => void;
}

const Stickman = memo(({ element, onResize, onResizeStart, onResizeEnd }: StickmanProps) => {
  const { id, x, y, width, height, pose: poseKey, body, tint, flip } = element;
  const board = useBoard();
  const { isSelected } = useSelectState(id);
  const sketch = useSketch(element);
  const pose = getStickPose(poseKey);
  const { isMoveArrowClosing, activeConnectId, arrowConnectPoints, arrowConnectExtendPoints } =
    useDropArrow(element);

  const resizePoints = useMemo(() => {
    const all = PointUtil.getResizePointFromRect({ x, y, width, height });
    return CORNERS.map(position => ({ position, point: all[position] }));
  }, [x, y, width, height]);

  const handleResizeStart = useMemoizedFn((startPoint: Point) => {
    onResizeStart?.(element, startPoint);
  });
  const handleResize = useMemoizedFn(
    (
      position: EHandlerPosition,
      startPoint: Point,
      endPoint: Point,
      _isPreserveRatio?: boolean,
      isAdsorb?: boolean
    ) => {
      onResize(board, element, position, startPoint, endPoint, true, isAdsorb);
    }
  );
  const handleResizeEnd = useMemoizedFn(() => onResizeEnd?.(board));

  return (
    <g>
      {pose ? (
        <svg
          x={x}
          y={y}
          width={width}
          height={height}
          viewBox={stickViewBox(pose)}
          preserveAspectRatio="xMidYMid meet"
          className="overflow-visible"
        >
          <StickFigure pose={pose} body={body} tint={tint} flip={flip} sketch={sketch} />
        </svg>
      ) : (
        // 更新版本写入的未知姿态：保留数据，只画占位框
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={8}
          fill="none"
          stroke="var(--tau-ink-3)"
          strokeDasharray="6 4"
        />
      )}
      <If condition={isSelected}>
        <g>
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            fillOpacity={SELECT_RECT_FILL_OPACITY}
            stroke={SELECT_RECT_STROKE}
            strokeWidth={SELECT_RECT_STROKE_WIDTH}
            style={{ pointerEvents: "none" }}
          />
          {resizePoints.map(({ position, point }) => (
            <ResizeCircle
              key={position}
              cx={point.x}
              cy={point.y}
              r={RESIZE_CIRCLE_RADIUS}
              fill={RESIZE_CIRCLE_FILL}
              position={position}
              onResizeStart={handleResizeStart}
              onResize={handleResize}
              onResizeEnd={handleResizeEnd}
            />
          ))}
        </g>
      </If>
      <ArrowConnectPointGroup
        element={element}
        points={arrowConnectExtendPoints}
        isSelected={isSelected}
        disabled={isMoveArrowClosing}
      />
      <If condition={isMoveArrowClosing}>
        {arrowConnectPoints.map(point => (
          <ArrowDropConnectPoint
            key={point.connectId}
            cx={point.point.x}
            cy={point.point.y}
            isActive={activeConnectId === point.connectId}
          />
        ))}
      </If>
    </g>
  );
});

export default Stickman;
