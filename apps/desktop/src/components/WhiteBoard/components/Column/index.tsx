import React, { memo, useState, useRef, useEffect } from "react";
import { useMemoizedFn } from "ahooks";

import { EHandlerPosition, Point, Board, ColumnElement } from "../../types";
import { COLUMN_DEFAULTS, COLUMN_COLORS } from "../../types/column";
import { useSelectState, useDropArrow, useColumnChildrenWatch } from "../../hooks";
import { PathUtil, ColumnUtil, PointUtil } from "../../utils";
import ArrowConnectPointGroup from "../ArrowConnectPointGroup";
import ArrowDropConnectPoint from "../ArrowDropConnectPoint";
import If from "@/components/If";
import EditText, { EditTextHandle } from "@/components/EditText";

import { SELECT_RECT_STROKE, SELECT_RECT_STROKE_WIDTH } from "../../constants";

interface ColumnProps {
  element: ColumnElement;
  board: Board;
  children?: React.ReactNode;
  onResizeStart?: (element: ColumnElement, startPoint: Point) => void;
  onResize: (
    board: Board,
    element: ColumnElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
    isPreserveRatio?: boolean,
    isAdsorb?: boolean
  ) => void;
  onResizeEnd?: (board: Board) => void;
}

const Column = memo(
  ({ element, board, children, onResize, onResizeStart, onResizeEnd }: ColumnProps) => {
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const titleRef = useRef<EditTextHandle>(null);
    const columnRef = useRef<SVGGElement>(null);

    const {
      x,
      y,
      width,
      title,
      padding,
      gap,
      isChildDraggingOver,
      dropIndex,
      draggingChildId,
      draggingPosition,
    } = element;

    const height = element.height || ColumnUtil.calculateHeight(board, element);

    const { isSelected } = useSelectState(element.id);
    const { isMoveArrowClosing, activeConnectId, arrowConnectPoints, arrowConnectExtendPoints } =
      useDropArrow({ ...element, height });

    // Watch for child element size changes and trigger relayout
    useColumnChildrenWatch({ board, column: element });

    const handleTitleBlur = () => {
      setIsEditingTitle(false);
      titleRef.current?.blur();

      // 从编辑元素列表中移除
      board.isEditingElements = board.isEditingElements.filter(eid => eid !== element.id);

      const newTitle = titleRef.current?.getValue() || "";
      const columnPath = PathUtil.getPathByElement(board, element);
      if (columnPath) {
        board.apply([
          {
            type: "set_node",
            path: columnPath,
            properties: { title: element.title },
            newProperties: { title: newTitle },
          },
        ]);
      }
    };

    const handleTitleFocus = () => {
      // 添加到编辑元素列表
      board.isEditingElements = [
        ...board.isEditingElements.filter(eid => eid !== element.id),
        element.id,
      ];
    };

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

    const handleOnResizeEnd = useMemoizedFn(() => {
      onResizeEnd?.(board);
    });

    useEffect(() => {
      if (isEditingTitle && titleRef.current) {
        titleRef.current.focus();
      }
    }, [isEditingTitle]);

    const { titleHeight, borderRadius, slotRadius, emptyHeight } = COLUMN_DEFAULTS;
    const isEmpty = element.children.length === 0;

    const getDropIndicatorY = () => {
      if (dropIndex === undefined) return 0;

      if (element.children.length === 0 || dropIndex === 0) {
        return y + titleHeight + padding;
      }

      if (dropIndex >= element.children.length) {
        const lastChild = element.children[element.children.length - 1];
        return lastChild.y + (lastChild.height || 50) + gap / 2;
      }

      const targetChild = element.children[dropIndex];
      return targetChild.y - gap / 2;
    };

    const dropIndicatorY = getDropIndicatorY();

    return (
      <g ref={columnRef}>
        {/* 托盘：surface 实底 + 发丝线，拖入时边线转 accent */}
        <rect
          className="cursor-move"
          x={x}
          y={y}
          width={width}
          height={height}
          rx={borderRadius}
          ry={borderRadius}
          style={{
            fill: isChildDraggingOver ? COLUMN_COLORS.trayDropOver : COLUMN_COLORS.tray,
            stroke: isChildDraggingOver ? COLUMN_COLORS.lineDropOver : COLUMN_COLORS.line,
            strokeWidth: 1,
          }}
        />

        {/* 标题栏：标题 + 数量居中 */}
        <foreignObject x={x} y={y} width={width} height={titleHeight} className="border-none">
          <div
            className="pointer-events-auto flex h-full cursor-move items-center justify-center gap-1.5"
            style={{ padding: `0 ${padding + 20}px` }}
            onWheel={e => e.stopPropagation()}
            onDoubleClick={e => {
              e.stopPropagation();
              setIsEditingTitle(true);
              handleTitleFocus();
              titleRef.current?.setContentEditable(true);
              titleRef.current?.focusEnd();
            }}
          >
            <EditText
              id={`column-title-${element.id}`}
              ref={titleRef}
              defaultValue={title || "Column"}
              className="text-tau-body-lg min-w-5 cursor-pointer select-none truncate font-semibold outline-none"
              style={{ color: COLUMN_COLORS.title }}
              contentEditable={isEditingTitle}
              onBlur={handleTitleBlur}
              onPressEnter={handleTitleBlur}
            />
            <span
              className="text-tau-sm pointer-events-none shrink-0 select-none tabular-nums"
              style={{ color: COLUMN_COLORS.muted }}
            >
              {element.children.length}
            </span>
          </div>
        </foreignObject>

        <line
          x1={x}
          y1={y + titleHeight}
          x2={x + width}
          y2={y + titleHeight}
          style={{ stroke: COLUMN_COLORS.line, strokeWidth: 1 }}
          className="pointer-events-none"
        />

        {/* 空列占位 */}
        <If condition={isEmpty && !isChildDraggingOver}>
          <g className="pointer-events-none">
            <rect
              x={x + padding}
              y={y + titleHeight + padding}
              width={width - padding * 2}
              height={emptyHeight}
              rx={slotRadius}
              ry={slotRadius}
              style={{
                fill: "none",
                stroke: COLUMN_COLORS.emptyLine,
                strokeWidth: 1.5,
                strokeDasharray: "5 4",
              }}
            />
            <text
              x={x + width / 2}
              y={y + titleHeight + padding + emptyHeight / 2}
              textAnchor="middle"
              dominantBaseline="central"
              className="text-tau-meta select-none"
              style={{ fill: COLUMN_COLORS.muted }}
            >
              拖入卡片
            </text>
          </g>
        </If>

        {/* 子元素：每个子元素下垫一张 surface 槽位（发丝线框），子元素自身背景画在其上 */}
        <g>
          {React.Children.map(children, (child, index) => {
            const childElement = element.children[index];
            if (!childElement) return null;

            const isDragging = draggingChildId === childElement.id;

            return (
              <g
                key={childElement.id}
                style={{
                  opacity: isDragging ? 0.5 : 1,
                  transition: "opacity 0.15s ease",
                }}
              >
                <rect
                  className="pointer-events-none"
                  x={childElement.x}
                  y={childElement.y}
                  width={childElement.width || width - padding * 2}
                  height={childElement.height || 50}
                  rx={slotRadius}
                  ry={slotRadius}
                  style={{
                    fill: COLUMN_COLORS.tray,
                    stroke: COLUMN_COLORS.line,
                    strokeWidth: 1,
                  }}
                />
                {child}
              </g>
            );
          })}
        </g>

        {/* Drop zone indicator */}
        <If condition={!!isChildDraggingOver && dropIndex !== undefined}>
          <rect
            x={x + padding}
            y={dropIndicatorY - 1}
            width={width - padding * 2}
            height={2}
            style={{ fill: COLUMN_COLORS.dropIndicator }}
            rx={1}
            ry={1}
            className="pointer-events-none"
          />
        </If>

        {/* Drag preview - shows the actual element being dragged at its current position */}
        {draggingChildId &&
          draggingPosition &&
          (() => {
            const draggingChildIndex = element.children.findIndex(c => c.id === draggingChildId);
            const draggingChild = element.children[draggingChildIndex];
            if (!draggingChild || draggingChildIndex === -1) return null;

            const previewWidth = draggingChild.width || width - padding * 2;
            const previewHeight = draggingChild.height || 50;

            // 找到对应的 React 子元素
            const childrenArray = React.Children.toArray(children);
            const draggingReactChild = childrenArray[draggingChildIndex];

            // 计算偏移量（从原位置到拖拽位置）
            const offsetX = draggingPosition.x - draggingChild.x;
            const offsetY = draggingPosition.y - draggingChild.y;

            return (
              <g className="pointer-events-none" style={{ opacity: 0.9 }}>
                {/* 槽位底 */}
                <rect
                  x={draggingPosition.x}
                  y={draggingPosition.y}
                  width={previewWidth}
                  height={previewHeight}
                  rx={slotRadius}
                  ry={slotRadius}
                  style={{
                    fill: COLUMN_COLORS.tray,
                    stroke: COLUMN_COLORS.line,
                    strokeWidth: 1,
                  }}
                />
                {/* 实际元素内容（通过 transform 移动到拖拽位置） */}
                <g transform={`translate(${offsetX}, ${offsetY})`}>{draggingReactChild}</g>
              </g>
            );
          })()}

        {/* Selection border and resize handles */}
        <If condition={isSelected}>
          <g>
            <rect
              className="pointer-events-none"
              x={x}
              y={y}
              width={width}
              height={height}
              fill="none"
              stroke={SELECT_RECT_STROKE}
              strokeWidth={SELECT_RECT_STROKE_WIDTH}
              rx={borderRadius}
              ry={borderRadius}
            />
            {/* Left resize handle */}
            <ColumnResizeHandle
              x={x}
              y={y}
              height={height}
              position={EHandlerPosition.Left}
              board={board}
              onResizeStart={handleOnResizeStart}
              onResize={handleOnResize}
              onResizeEnd={handleOnResizeEnd}
            />
            {/* Right resize handle */}
            <ColumnResizeHandle
              x={x + width}
              y={y}
              height={height}
              position={EHandlerPosition.Right}
              board={board}
              onResizeStart={handleOnResizeStart}
              onResize={handleOnResize}
              onResizeEnd={handleOnResizeEnd}
            />
          </g>
        </If>
        <ArrowConnectPointGroup
          element={element}
          points={arrowConnectExtendPoints}
          proximityBounds={{ x, y, width, height }}
          isSelected={isSelected}
          disabled={isMoveArrowClosing}
        />

        {/* Arrow drop connect points */}
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
  }
);

// Vertical resize handle for Column (left/right edges)
interface ColumnResizeHandleProps {
  x: number;
  y: number;
  height: number;
  position: EHandlerPosition;
  board: Board;
  onResizeStart: (startPoint: Point) => void;
  onResize: (
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
    isPreserveRatio?: boolean,
    isAdsorb?: boolean
  ) => void;
  onResizeEnd: () => void;
}

const ColumnResizeHandle = memo(
  ({
    x,
    y,
    height,
    position,
    board,
    onResizeStart,
    onResize,
    onResizeEnd,
  }: ColumnResizeHandleProps) => {
    const isResizing = useRef(false);
    const startPoint = useRef<Point | null>(null);

    const handlePointerDown = useMemoizedFn((e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      isResizing.current = true;

      // Convert screen coordinates to board coordinates
      const point = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
      if (!point) return;

      startPoint.current = point;
      onResizeStart(point);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        if (!isResizing.current || !startPoint.current) return;
        const endPoint = PointUtil.screenToViewPort(board, moveEvent.clientX, moveEvent.clientY);
        if (!endPoint) return;

        const isPreserveRatio = moveEvent.shiftKey;
        const isAdsorb = !moveEvent.altKey;
        onResize(position, startPoint.current, endPoint, isPreserveRatio, isAdsorb);
      };

      const handlePointerUp = () => {
        isResizing.current = false;
        startPoint.current = null;
        onResizeEnd();
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);
      };

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
    });

    const handleWidth = 8;
    const handleX = position === EHandlerPosition.Left ? x - handleWidth / 2 : x - handleWidth / 2;

    return (
      <rect
        x={handleX}
        y={y}
        width={handleWidth}
        height={height}
        fill="transparent"
        className="cursor-ew-resize"
        onPointerDown={handlePointerDown}
      />
    );
  }
);

ColumnResizeHandle.displayName = "ColumnResizeHandle";
Column.displayName = "Column";

export default Column;
