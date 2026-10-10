import type { ReactNode } from "react";
import type { BoardElement, EHandlerPosition, Point } from "../types";
import { useBoard, useSelectState, useDropArrow } from "../hooks";
import { PointUtil } from "../utils/PointUtil";
import {
  SELECT_RECT_STROKE,
  SELECT_RECT_STROKE_WIDTH,
  RESIZE_CIRCLE_RADIUS,
  RESIZE_CIRCLE_FILL,
} from "../constants";
import ResizeCircle from "./ResizeCircle";
import ArrowConnectPointGroup from "./ArrowConnectPointGroup";
import ArrowDropConnectPoint from "./ArrowDropConnectPoint";

export interface ElementFrameProps {
  element: BoardElement;
  children?: ReactNode;
  onResizeStart?(element: any, point: Point): void;
  onResize?(
    board: any,
    element: any,
    position: EHandlerPosition,
    start: Point,
    end: Point,
    preserve?: boolean,
    adsorb?: boolean
  ): void;
  onResizeEnd?(
    board: any,
    element: any,
    position: EHandlerPosition,
    start: Point,
    end: Point
  ): void;
  [key: string]: any;
}

export default function ElementFrame({
  element,
  children,
  onResize,
  onResizeStart,
  onResizeEnd,
}: ElementFrameProps) {
  const board = useBoard();
  const { isSelected } = useSelectState(element.id);
  const { isMoveArrowClosing, activeConnectId, arrowConnectPoints, arrowConnectExtendPoints } =
    useDropArrow(element);
  const { x, y, width, height = 80 } = element;
  const points = PointUtil.getResizePointFromRect({ x, y, width, height });
  return (
    <>
      <foreignObject x={x} y={y} width={width} height={height}>
        <div className="bg-surface border-line-1 text-ink-3 rounded-tau-sm text-tau-meta flex size-full items-center justify-center border">
          {children}
        </div>
      </foreignObject>
      {isSelected && (
        <>
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            fill="none"
            stroke={SELECT_RECT_STROKE}
            strokeWidth={SELECT_RECT_STROKE_WIDTH}
            className="pointer-events-none"
          />
          {!board.readonly &&
            element.resizable !== false &&
            onResize &&
            Object.entries(points).map(([position, point]) => (
              <ResizeCircle
                key={position}
                position={position as EHandlerPosition}
                cx={point.x}
                cy={point.y}
                r={RESIZE_CIRCLE_RADIUS}
                fill={RESIZE_CIRCLE_FILL}
                onResizeStart={start => onResizeStart?.(element, start)}
                onResize={(handle, start, end, preserve, adsorb) =>
                  onResize(board, element, handle, start, end, preserve, adsorb)
                }
                onResizeEnd={(handle, start, end) =>
                  onResizeEnd?.(board, element, handle, start, end)
                }
              />
            ))}
        </>
      )}
      <ArrowConnectPointGroup
        element={element}
        points={arrowConnectExtendPoints}
        isSelected={isSelected}
        disabled={isMoveArrowClosing}
      />
      {isMoveArrowClosing &&
        arrowConnectPoints.map(point => (
          <ArrowDropConnectPoint
            key={point.connectId}
            cx={point.point.x}
            cy={point.point.y}
            isActive={activeConnectId === point.connectId}
          />
        ))}
    </>
  );
}
