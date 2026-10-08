import { memo, useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import { If as If } from "@tau/ui";
import ResizeCircle from "../ResizeCircle";
import ArrowConnectPointGroup from "../ArrowConnectPointGroup";
import ArrowDropConnectPoint from "../ArrowDropConnectPoint";
import WhiteBoardCard from "../WhiteBoardCard";

import { Board, EHandlerPosition, Point } from "../../types";
import { PointUtil } from "../../utils";
import { useSelectState, useDropArrow } from "../../hooks";
import {
  SELECT_RECT_STROKE,
  SELECT_RECT_STROKE_WIDTH,
  SELECT_RECT_FILL_OPACITY,
  RESIZE_CIRCLE_FILL,
  RESIZE_CIRCLE_RADIUS,
} from "../../constants";
import { WhiteBoardElement } from "../../plugins/WhiteBoardPlugin";

interface WhiteBoardElementProps {
  element: WhiteBoardElement;
  board: Board;
  onResizeStart?: (element: WhiteBoardElement, startPoint: Point) => void;
  onResize: (
    board: Board,
    element: WhiteBoardElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
    isPreserveRatio?: boolean,
    isAdsorb?: boolean
  ) => void;
  onResizeEnd?: (
    board: Board,
    element: WhiteBoardElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point
  ) => void;
}

const WhiteBoardElementComponent = memo((props: WhiteBoardElementProps) => {
  const { element, board, onResize, onResizeStart, onResizeEnd } = props;

  const { id, x, y, width, height, resizable = true } = element;

  const { isSelected } = useSelectState(id);

  const { isMoveArrowClosing, activeConnectId, arrowConnectPoints, arrowConnectExtendPoints } =
    useDropArrow(element);

  // 只获取左右两侧的 resize points（Left 和 Right）
  const [resizePoints] = useMemo(() => {
    const allResizePoints = PointUtil.getResizePointFromRect({
      x,
      y,
      width,
      height,
    });

    // 只保留左右两侧的点
    const horizontalResizePoints = {
      [EHandlerPosition.Left]: allResizePoints[EHandlerPosition.Left],
      [EHandlerPosition.Right]: allResizePoints[EHandlerPosition.Right],
    };

    return [horizontalResizePoints];
  }, [x, y, width, height]);

  const handleOnResizeStart = useMemoizedFn((startPoint: Point) => {
    onResizeStart?.(element, startPoint);
  });

  const handleOnResize = useMemoizedFn(
    (
      position: EHandlerPosition,
      startPoint: Point,
      endPoint: Point,
      isPreserveRatio?: boolean,
      isAdsorb?: boolean
    ) => {
      onResize(board, element, position, startPoint, endPoint, isPreserveRatio, isAdsorb);
    }
  );

  const handleOnResizeEnd = useMemoizedFn(
    (position: EHandlerPosition, startPoint: Point, endPoint: Point) => {
      onResizeEnd?.(board, element, position, startPoint, endPoint);
    }
  );

  return (
    <>
      {/* 渲染白板卡片内容 */}
      <WhiteBoardCard board={board} element={element} />

      {/* 选中状态 */}
      <If condition={isSelected}>
        <g>
          {/* 选中边框 */}
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            fillOpacity={SELECT_RECT_FILL_OPACITY}
            stroke={SELECT_RECT_STROKE}
            strokeWidth={SELECT_RECT_STROKE_WIDTH}
            rx={8}
            ry={8}
            style={{ pointerEvents: "none" }}
          />
          {/* 只渲染左右两侧的 resize handles */}
          {resizable &&
            Object.entries(resizePoints).map(([position, point]) => (
              <ResizeCircle
                key={position}
                cx={point.x}
                cy={point.y}
                r={RESIZE_CIRCLE_RADIUS}
                fill={RESIZE_CIRCLE_FILL}
                position={position as EHandlerPosition}
                onResizeStart={handleOnResizeStart}
                onResize={handleOnResize}
                onResizeEnd={handleOnResizeEnd}
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
      {/* 箭头放置连接点 */}
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
    </>
  );
});

WhiteBoardElementComponent.displayName = "WhiteBoardElementComponent";

export default WhiteBoardElementComponent;
