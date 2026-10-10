import { memo, useMemo, type MouseEvent } from "react";
import { useMemoizedFn } from "ahooks";
import ResizeCircle from "../ResizeCircle";
import ArrowConnectPointGroup from "../ArrowConnectPointGroup";
import ArrowDropConnectPoint from "../ArrowDropConnectPoint";
import SketchRect from "../SketchPaths/SketchRect";
import { useElementContent } from "../../extensions/elementContent";
import { Board, EHandlerPosition, Point } from "../../types";
import { PointUtil } from "../../utils";
import { useBoard, useSelectState, useDropArrow, useSketch } from "../../hooks";
import {
  SELECT_RECT_STROKE,
  SELECT_RECT_STROKE_WIDTH,
  RESIZE_CIRCLE_FILL,
  RESIZE_CIRCLE_RADIUS,
  SKETCH_MEDIA_FRAME,
} from "../../constants";
import { requestOpenDocument, type DocumentElement } from "../../plugins/DocumentPlugin";

/** 画布上文档卡的圆角，宿主的纸面与选中框共用 */
export const DOCUMENT_CARD_RADIUS = 16;

interface DocumentElementProps {
  element: DocumentElement;
  onResizeStart?: (element: DocumentElement, startPoint: Point) => void;
  onResize: (
    board: Board,
    element: DocumentElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
    isPreserveRatio?: boolean,
    isAdsorb?: boolean
  ) => void;
  onResizeEnd?: (
    board: Board,
    element: DocumentElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point
  ) => void;
}

/** 文档卡外壳负责选中、缩放和连线，纸面由文档扩展的渲染闭包提供。 */
const DocumentElementComponent = memo((props: DocumentElementProps) => {
  const { element, onResize, onResizeStart, onResizeEnd } = props;
  const { id, x, y, width, height } = element;
  const board = useBoard();
  const sketch = useSketch(element);
  const Paper = useElementContent();
  const { isSelected } = useSelectState(id);
  const { isMoveArrowClosing, activeConnectId, arrowConnectPoints, arrowConnectExtendPoints } =
    useDropArrow(element);

  const resizePoints = useMemo(
    () => PointUtil.getResizePointFromRect({ x, y, width, height }),
    [x, y, width, height]
  );

  const handleDoubleClick = useMemoizedFn((e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    requestOpenDocument(board, id);
  });

  return (
    <>
      {/* 纸面阴影落在元素盒子之外，foreignObject 默认裁切溢出 */}
      <foreignObject x={x} y={y} width={width} height={height} style={{ overflow: "visible" }}>
        <div className="size-full cursor-move" onDoubleClick={handleDoubleClick}>
          {Paper ? (
            <Paper element={element} sketch={sketch.enabled} />
          ) : (
            <div className="bg-surface border-line-1 text-ink-3 rounded-tau-sm text-tau-meta flex size-full items-center justify-center border">
              文档内容需要宿主支持
            </div>
          )}
        </div>
      </foreignObject>
      {sketch.enabled && (
        <SketchRect
          x={x}
          y={y}
          width={width}
          height={height}
          radius={DOCUMENT_CARD_RADIUS}
          stroke={SKETCH_MEDIA_FRAME}
          strokeWidth={1.5}
          level={sketch.level}
          seed={sketch.seed}
        />
      )}
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
            rx={DOCUMENT_CARD_RADIUS}
            ry={DOCUMENT_CARD_RADIUS}
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

DocumentElementComponent.displayName = "DocumentElementComponent";

export default DocumentElementComponent;
