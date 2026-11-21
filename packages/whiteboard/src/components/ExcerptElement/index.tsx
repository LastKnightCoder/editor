import { memo, useMemo } from "react";
import ResizeCircle from "../ResizeCircle";
import ArrowConnectPointGroup from "../ArrowConnectPointGroup";
import ArrowDropConnectPoint from "../ArrowDropConnectPoint";
import { useElementContent } from "../../extensions/elementContent";
import { Board, EHandlerPosition, Point } from "../../types";
import { PointUtil } from "../../utils";
import { useBoard, useSelectState, useDropArrow, useSketch } from "../../hooks";
import {
  SELECT_RECT_STROKE,
  SELECT_RECT_STROKE_WIDTH,
  RESIZE_CIRCLE_FILL,
  RESIZE_CIRCLE_RADIUS,
} from "../../constants";
import type { ExcerptElement } from "../../plugins/ExcerptPlugin";

/** 摘录卡的圆角，宿主卡面与选中框共用 */
export const EXCERPT_CARD_RADIUS = 10;

interface ExcerptElementProps {
  element: ExcerptElement;
  onResizeStart?: (element: ExcerptElement, startPoint: Point) => void;
  onResize: (
    board: Board,
    element: ExcerptElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
    isPreserveRatio?: boolean,
    isAdsorb?: boolean
  ) => void;
  onResizeEnd?: (
    board: Board,
    element: ExcerptElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point
  ) => void;
}

/** 摘录外壳负责选中、缩放和连线，卡面（原文、笔记、来源条）由摘录扩展的宿主 Body 提供。 */
const ExcerptElementComponent = memo((props: ExcerptElementProps) => {
  const { element, onResize, onResizeStart, onResizeEnd } = props;
  const { id, x, y, width, height } = element;
  const board = useBoard();
  const sketch = useSketch(element);
  const Face = useElementContent();
  const { isSelected } = useSelectState(id);
  const { isMoveArrowClosing, activeConnectId, arrowConnectPoints, arrowConnectExtendPoints } =
    useDropArrow(element);
  const resizePoints = useMemo(
    () => PointUtil.getResizePointFromRect({ x, y, width, height }),
    [x, y, width, height]
  );

  return (
    <>
      <foreignObject x={x} y={y} width={width} height={height} style={{ overflow: "visible" }}>
        <div className="size-full cursor-move">
          {Face ? (
            <Face element={element} sketch={sketch.enabled} />
          ) : (
            <div className="bg-surface border-line-1 text-ink-2 text-tau-meta size-full overflow-hidden rounded-[10px] border p-3">
              {element.quote}
            </div>
          )}
        </div>
      </foreignObject>
      {isSelected && (
        <g>
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            fill="none"
            stroke={SELECT_RECT_STROKE}
            strokeWidth={SELECT_RECT_STROKE_WIDTH}
            rx={EXCERPT_CARD_RADIUS}
            ry={EXCERPT_CARD_RADIUS}
            className="pointer-events-none"
          />
          {!board.readonly &&
            Object.entries(resizePoints).map(([position, point]) => (
              <ResizeCircle
                key={position}
                cx={point.x}
                cy={point.y}
                r={RESIZE_CIRCLE_RADIUS}
                fill={RESIZE_CIRCLE_FILL}
                position={position as EHandlerPosition}
                onResizeStart={start => onResizeStart?.(element, start)}
                onResize={(handle, start, end, preserve, adsorb) =>
                  onResize(board, element, handle, start, end, preserve, adsorb)
                }
                onResizeEnd={(handle, start, end) =>
                  onResizeEnd?.(board, element, handle, start, end)
                }
              />
            ))}
        </g>
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
});

ExcerptElementComponent.displayName = "ExcerptElementComponent";

export default ExcerptElementComponent;
