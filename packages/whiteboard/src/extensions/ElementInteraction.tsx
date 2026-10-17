import { useCallback, useContext, useSyncExternalStore } from "react";
import { StaticSelectionContext } from "../context";
import { CommonPlugin, type CommonElement } from "../plugins/CommonPlugin";
import type { WhiteboardElementDefinition } from "./api";
import { useBoard } from "../hooks/useBoard";
import { useSelectState } from "../hooks/useSelectState";
import { useDropArrow } from "../hooks/useDropArrow";
import { PointUtil } from "../utils/PointUtil";
import { EHandlerPosition } from "../types/resize";
import ResizeCircle from "../components/ResizeCircle";
import ArrowConnectPointGroup from "../components/ArrowConnectPointGroup";
import ArrowDropConnectPoint from "../components/ArrowDropConnectPoint";
import {
  SELECT_RECT_STROKE,
  SELECT_RECT_STROKE_WIDTH,
  RESIZE_CIRCLE_FILL,
  RESIZE_CIRCLE_RADIUS,
} from "../constants";

/** 内部适配器仅复用矩形算法；作者只能声明交互选项，拿不到此实例。 */
export class ElementInteraction extends CommonPlugin {
  constructor(readonly name: string) {
    super();
  }
  start = this.onResizeStart;
  resize = this.onResize;
  end = this.onResizeEnd;
}
const corners = new Set([
  EHandlerPosition.TopLeft,
  EHandlerPosition.TopRight,
  EHandlerPosition.BottomLeft,
  EHandlerPosition.BottomRight,
]);

export function ElementControls({
  element,
  options,
  adapter,
}: {
  element: CommonElement;
  options: NonNullable<WhiteboardElementDefinition["interaction"]>;
  adapter: ElementInteraction;
}) {
  const board = useBoard();
  const isolated = useContext(StaticSelectionContext);
  const { isSelected } = useSelectState(element.id);
  const subscribe = useCallback(
    (notify: () => void) => {
      board.on("readonly:change", notify);
      return () => board.off("readonly:change", notify);
    },
    [board]
  );
  const readonly = useSyncExternalStore(subscribe, () => board.readonly);
  if (isolated || ![element.x, element.y, element.width, element.height].every(Number.isFinite))
    return null;
  const points = PointUtil.getResizePointFromRect(element);
  return (
    <g data-element-controls={element.id}>
      {isSelected && (
        <rect
          x={element.x}
          y={element.y}
          width={element.width}
          height={element.height}
          fill="none"
          stroke={SELECT_RECT_STROKE}
          strokeWidth={SELECT_RECT_STROKE_WIDTH}
          pointerEvents="none"
        />
      )}
      {isSelected &&
        !readonly &&
        element.resizable !== false &&
        options.resize &&
        Object.entries(points)
          .filter(
            ([position]) =>
              options.resize?.handles !== "corners" || corners.has(position as EHandlerPosition)
          )
          .map(([position, point]) => (
            <g key={position} data-resize-handle={position}>
              <ResizeCircle
                cx={point.x}
                cy={point.y}
                r={RESIZE_CIRCLE_RADIUS}
                fill={RESIZE_CIRCLE_FILL}
                position={position as EHandlerPosition}
                onResizeStart={() => adapter.start(element)}
                onResize={(handle, start, end, preserve, snap) =>
                  adapter.resize(
                    board,
                    element,
                    handle,
                    start,
                    end,
                    options.resize?.preserveAspectRatio || preserve,
                    snap
                  )
                }
                onResizeEnd={() => adapter.end(board)}
              />
            </g>
          ))}
      {options.connect && !readonly && <Connections element={element} selected={isSelected} />}
    </g>
  );
}

function Connections({ element, selected }: { element: CommonElement; selected: boolean }) {
  const { isMoveArrowClosing, activeConnectId, arrowConnectPoints, arrowConnectExtendPoints } =
    useDropArrow(element);
  return (
    <>
      <ArrowConnectPointGroup
        element={element}
        points={arrowConnectExtendPoints}
        isSelected={selected}
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
