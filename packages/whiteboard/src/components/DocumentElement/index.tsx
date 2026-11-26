import { HostSupportHint } from "../HostSupportHint";
import { memo, useEffect, useMemo, useRef, type MouseEvent, type PointerEvent } from "react";
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
import {
  DOCUMENT_PEEK_DELAY,
  requestInsertDocument,
  requestOpenDocument,
  requestPeekDocument,
  type DocumentElement,
} from "../../plugins/DocumentPlugin";

/** 按住期间指针移动超过这个距离（屏幕像素）就是拖动，不再速览 */
const PEEK_MOVE_TOLERANCE = 4;

/** 长按速览：按住不动 250ms 开始，松手、移动或失焦结束 */
function useLongPressPeek(board: Board, id: string) {
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  return useMemoizedFn((event: PointerEvent) => {
    if (event.button !== 0 || event.shiftKey || event.metaKey || event.ctrlKey) return;
    cleanup.current?.();
    const start = { x: event.clientX, y: event.clientY };
    let peeking = false;
    const timer = window.setTimeout(() => {
      peeking = true;
      requestPeekDocument(board, id);
    }, DOCUMENT_PEEK_DELAY);
    const stop = () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointerup", stop, true);
      document.removeEventListener("pointercancel", stop, true);
      window.removeEventListener("blur", stop);
      cleanup.current = null;
      if (peeking) requestPeekDocument(board, null);
    };
    const onMove = (move: globalThis.PointerEvent) => {
      if (Math.hypot(move.clientX - start.x, move.clientY - start.y) > PEEK_MOVE_TOLERANCE) stop();
    };
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerup", stop, true);
    document.addEventListener("pointercancel", stop, true);
    window.addEventListener("blur", stop);
    cleanup.current = stop;
  });
}

/** 画布上文档卡的圆角，宿主的纸面与选中框共用 */
export const DOCUMENT_CARD_RADIUS = 16;

interface DocumentElementProps {
  element: DocumentElement;
  /** 从连接点拖到空白处松手时打开放入面板（宿主装配了放入入口才开） */
  insertable?: boolean;
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
  const { element, insertable = false, onResize, onResizeStart, onResizeEnd } = props;
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

  const handleReleaseInSpace = useMemoizedFn(
    ({
      point,
      clientX,
      clientY,
      release,
    }: {
      point: Point;
      clientX: number;
      clientY: number;
      release(): void;
    }) => {
      if (!insertable || board.readonly) return false;
      requestInsertDocument(board, {
        at: point,
        screen: { x: clientX, y: clientY },
        linkFrom: id,
        release,
      });
      return true;
    }
  );

  const handlePointerDown = useLongPressPeek(board, id);

  const handleDoubleClick = useMemoizedFn((e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    requestOpenDocument(board, id);
  });

  return (
    <>
      {/* 纸面阴影落在元素盒子之外，foreignObject 默认裁切溢出 */}
      <foreignObject x={x} y={y} width={width} height={height} style={{ overflow: "visible" }}>
        <div
          className="size-full cursor-move"
          onPointerDown={handlePointerDown}
          onDoubleClick={handleDoubleClick}
        >
          {Paper ? (
            <Paper element={element} sketch={sketch.enabled} />
          ) : (
            <div className="bg-surface border-line-1 text-ink-3 rounded-tau-sm text-tau-meta flex size-full items-center justify-center border">
              <HostSupportHint kind="document" />
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
        onReleaseInSpace={handleReleaseInSpace}
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
