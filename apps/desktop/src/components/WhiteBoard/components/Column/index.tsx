import React, { memo, useState, useRef, useEffect } from "react";
import { useMemoizedFn } from "ahooks";

import { EHandlerPosition, Point, Board, ColumnElement } from "../../types";
import { COLUMN_DEFAULTS } from "../../types/column";
import {
  useSelectState,
  useDropArrow,
  useColumnChildrenWatch,
} from "../../hooks";
import { PathUtil, ColumnUtil, PointUtil } from "../../utils";
import ArrowConnectPointGroup from "../ArrowConnectPointGroup";
import ArrowDropConnectPoint from "../ArrowDropConnectPoint";
import If from "@/components/If";
import EditText, { EditTextHandle } from "@/components/EditText";
import useTheme from "@/hooks/useTheme";

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
    isAdsorb?: boolean,
  ) => void;
  onResizeEnd?: (board: Board) => void;
}

const Column = memo(
  ({
    element,
    board,
    children,
    onResize,
    onResizeStart,
    onResizeEnd,
  }: ColumnProps) => {
    const { isDark } = useTheme();
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const titleRef = useRef<EditTextHandle>(null);
    const columnRef = useRef<SVGGElement>(null);

    const {
      x,
      y,
      width,
      title,
      borderRadius,
      shadowEnabled,
      padding,
      gap,
      isChildDraggingOver,
      dropIndex,
      draggingChildId,
      draggingPosition,
    } = element;

    const actualBackgroundColor = isDark
      ? "rgba(30, 35, 45, 0.85)"
      : "rgba(248, 250, 255, 0.9)";
    const titleTextColor = isDark
      ? "rgba(241, 245, 249, 0.9)"
      : "rgba(15, 23, 42, 0.85)";
    const childBorderColor = isDark
      ? "rgba(255, 255, 255, 0.08)"
      : "rgba(0, 0, 0, 0.06)";
    const columnBorderColor = isDark
      ? "rgba(255, 255, 255, 0.12)"
      : "rgba(255, 255, 255, 0.45)";

    const height = element.height || ColumnUtil.calculateHeight(board, element);

    const { isSelected } = useSelectState(element.id);
    const {
      isMoveArrowClosing,
      activeConnectId,
      arrowConnectPoints,
      arrowConnectExtendPoints,
    } = useDropArrow({ ...element, height });

    // Watch for child element size changes and trigger relayout
    useColumnChildrenWatch({ board, column: element });

    const handleTitleBlur = () => {
      setIsEditingTitle(false);
      titleRef.current?.blur();

      // 从编辑元素列表中移除
      board.isEditingElements = board.isEditingElements.filter(
        (eid) => eid !== element.id,
      );

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
        ...board.isEditingElements.filter((eid) => eid !== element.id),
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
        isAdsorb?: boolean,
      ) => {
        onResize(
          board,
          element,
          position,
          startPoint,
          endPoint,
          isPreserveRatio,
          isAdsorb,
        );
      },
    );

    const handleOnResizeEnd = useMemoizedFn(() => {
      onResizeEnd?.(board);
    });

    useEffect(() => {
      if (isEditingTitle && titleRef.current) {
        titleRef.current.focus();
      }
    }, [isEditingTitle]);

    const titleHeight = COLUMN_DEFAULTS.titleHeight;
    const shadowFilter = shadowEnabled
      ? isDark
        ? "drop-shadow(0 4px 12px rgba(0,0,0,0.35))"
        : "drop-shadow(0 4px 12px rgba(15,23,42,0.12))"
      : "none";
    const titleBorderColor = isDark
      ? "rgba(255, 255, 255, 0.08)"
      : "rgba(0, 0, 0, 0.06)";

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
        {/* Background with card styling */}
        <rect
          className="cursor-move"
          x={x}
          y={y}
          width={width}
          height={height}
          fill={actualBackgroundColor}
          rx={borderRadius}
          ry={borderRadius}
          style={{ filter: shadowFilter }}
          stroke={isChildDraggingOver ? "#14b8a6" : columnBorderColor}
          strokeWidth={isChildDraggingOver ? 2 : 1}
          strokeDasharray={isChildDraggingOver ? "6 4" : "0"}
        />

        {/* Title area */}
        <foreignObject
          x={x}
          y={y}
          width={width}
          height={titleHeight}
          className="border-none"
        >
          <div
            className="flex flex-col items-center justify-center h-full pointer-events-auto cursor-move"
            style={{ padding: `0 ${padding}px` }}
            onWheel={(e) => e.stopPropagation()}
            onDoubleClick={(e) => {
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
              className="text-lg font-bold cursor-pointer select-none min-w-5 outline-none"
              style={{ color: titleTextColor }}
              contentEditable={isEditingTitle}
              onBlur={handleTitleBlur}
              onPressEnter={handleTitleBlur}
            />
          </div>
        </foreignObject>

        {/* Title separator line */}
        <line
          x1={x + padding}
          y1={y + titleHeight}
          x2={x + width - padding}
          y2={y + titleHeight}
          stroke={titleBorderColor}
          strokeWidth={1.5}
          className="pointer-events-none"
        />

        {/* Children container - rendered directly at their stored positions */}
        <g>
          {React.Children.map(children, (child, index) => {
            const childElement = element.children[index];
            if (!childElement) return null;

            // Check if this child is being dragged
            const isDragging = draggingChildId === childElement.id;

            // Calculate border position based on child's stored position
            const borderX = childElement.x;
            const borderY = childElement.y;
            const borderWidth = childElement.width || width - padding * 2;
            const borderHeight = childElement.height || 50;

            return (
              <g
                key={childElement.id}
                style={{
                  opacity: isDragging ? 0.5 : 1,
                  transition: "opacity 0.15s ease",
                }}
              >
                {/* Milanote-style border around each child */}
                <rect
                  x={borderX}
                  y={borderY}
                  width={borderWidth}
                  height={borderHeight}
                  fill="none"
                  stroke={childBorderColor}
                  strokeWidth={1}
                  rx={4}
                  ry={4}
                  className="pointer-events-none"
                />
                {/* Render child directly - no transform needed as positions are already calculated */}
                {child}
              </g>
            );
          })}
        </g>

        {/* Drop zone indicator */}
        <If condition={!!isChildDraggingOver && dropIndex !== undefined}>
          <rect
            x={x + padding}
            y={dropIndicatorY - 2}
            width={width - padding * 2}
            height={4}
            fill="#14b8a6"
            rx={2}
            ry={2}
            className="pointer-events-none"
          />
        </If>

        {/* Drag preview - shows the actual element being dragged at its current position */}
        {draggingChildId &&
          draggingPosition &&
          (() => {
            const draggingChildIndex = element.children.findIndex(
              (c) => c.id === draggingChildId,
            );
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
                {/* 边框 */}
                <rect
                  x={draggingPosition.x}
                  y={draggingPosition.y}
                  width={previewWidth}
                  height={previewHeight}
                  fill="none"
                  stroke="#14b8a6"
                  strokeWidth={2}
                  rx={4}
                  ry={4}
                />
                {/* 实际元素内容（通过 transform 移动到拖拽位置） */}
                <g transform={`translate(${offsetX}, ${offsetY})`}>
                  {draggingReactChild}
                </g>
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
          {arrowConnectPoints.map((point) => (
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
  },
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
    isAdsorb?: boolean,
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
        const endPoint = PointUtil.screenToViewPort(
          board,
          moveEvent.clientX,
          moveEvent.clientY,
        );
        if (!endPoint) return;

        const isPreserveRatio = moveEvent.shiftKey;
        const isAdsorb = !moveEvent.altKey;
        onResize(
          position,
          startPoint.current,
          endPoint,
          isPreserveRatio,
          isAdsorb,
        );
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
    const handleX =
      position === EHandlerPosition.Left
        ? x - handleWidth / 2
        : x - handleWidth / 2;

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
  },
);

ColumnResizeHandle.displayName = "ColumnResizeHandle";
Column.displayName = "Column";

export default Column;
