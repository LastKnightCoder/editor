import React, { memo, useState, useRef, useEffect, useLayoutEffect } from "react";
import { useMemoizedFn } from "ahooks";
import { ChevronDown, Plus } from "lucide-react";
import { cn } from "@tau/ui";

import { EHandlerPosition, Point, Board, BoardElement, ColumnElement } from "../../types";
import { COLUMN_DEFAULTS, COLUMN_COLORS, COLUMN_COLOR_OPTIONS } from "../../types/column";
import { useSelectState, useDropArrow, useColumnChildrenWatch } from "../../hooks";
import { PathUtil, ColumnUtil, PointUtil } from "../../utils";
import ArrowConnectPointGroup from "../ArrowConnectPointGroup";
import ArrowDropConnectPoint from "../ArrowDropConnectPoint";
import If from "@/components/If";
import EditText, { EditTextHandle } from "@/components/EditText";

import { SELECT_RECT_STROKE, SELECT_RECT_STROKE_WIDTH } from "../../constants";

const PLACEHOLDER_KEY = "__placeholder__";
const APPEND_BUTTON_HEIGHT = 32;

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
      collapsed,
      isChildDraggingOver,
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

    const {
      titleHeight,
      borderRadius,
      slotRadius,
      emptyHeight,
      colorBandHeight,
      collapsedStackHeight,
      animationDuration,
      animationEasing,
    } = COLUMN_DEFAULTS;
    const colorToken = COLUMN_COLOR_OPTIONS.find(o => o.value === element.color)?.token;
    const hasStack = !!collapsed && element.children.length > 0;

    // 拖拽中的视觉布局：被拖出的子元素原位合拢，落点处空出占位块
    const layout = ColumnUtil.getVisualLayout(element);
    const visualHeight = height + layout.height - ColumnUtil.calculateHeightFromChildren(element);
    // 折叠态托盘只到标题栏，纸边露在下方
    const trayHeight = collapsed ? titleHeight : visualHeight;
    const canAppend = !board.readonly && !collapsed && !isChildDraggingOver && !draggingChildId;

    /** 子元素的视觉位置（相对列原点）：被拖拽的跟随指针，其余取视觉布局 */
    const getVisualOffset = (child: BoardElement) => {
      if (child.id === draggingChildId && draggingPosition) {
        return { x: draggingPosition.x - x, y: draggingPosition.y - y };
      }
      return { x: child.x - x, y: (layout.childYs.get(child.id) ?? child.y) - y };
    };

    // FLIP：视觉位置变化时从旧位置滑到新位置（相对列原点，整列拖动不触发）
    const itemRefs = useRef(new Map<string, SVGGElement>());
    const placeholderRef = useRef<SVGRectElement>(null);
    const prevOffsetsRef = useRef(new Map<string, { x: number; y: number }>());
    const prevCollapsedRef = useRef(!!collapsed);

    useLayoutEffect(() => {
      const nextOffsets = new Map<string, { x: number; y: number }>();
      const animateFrom = (node: Element, dx: number, dy: number) => {
        // 动画进行中被打断时，从当前插值位置接着滑
        const current = getComputedStyle(node).transform;
        if (current && current !== "none") {
          const matrix = new DOMMatrixReadOnly(current);
          dx += matrix.e;
          dy += matrix.f;
        }
        node.getAnimations().forEach(animation => animation.cancel());
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
        node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
          duration: animationDuration,
          easing: animationEasing,
        });
      };

      element.children.forEach(child => {
        const offset = getVisualOffset(child);
        nextOffsets.set(child.id, offset);
        const prev = prevOffsetsRef.current.get(child.id);
        const node = itemRefs.current.get(child.id);
        if (!prev || !node || child.id === draggingChildId) return;
        if (prev.x === offset.x && prev.y === offset.y) return;
        animateFrom(node, prev.x - offset.x, prev.y - offset.y);
      });

      const placeholder = placeholderRef.current;
      if (placeholder && layout.placeholderY !== null) {
        const offset = { x: 0, y: layout.placeholderY - y };
        const prev = prevOffsetsRef.current.get(PLACEHOLDER_KEY);
        if (!prev) {
          placeholder.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: animationDuration,
            easing: animationEasing,
          });
        } else if (prev.y !== offset.y) {
          animateFrom(placeholder, 0, prev.y - offset.y);
        }
        nextOffsets.set(PLACEHOLDER_KEY, offset);
      }

      // 展开：子元素随托盘增高淡入
      if (prevCollapsedRef.current && !collapsed) {
        itemRefs.current.forEach(node =>
          node.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: animationDuration,
            easing: animationEasing,
          })
        );
      }
      prevCollapsedRef.current = !!collapsed;

      prevOffsetsRef.current = nextOffsets;
    });

    return (
      <g ref={columnRef} className="group/column">
        {/* 折叠态纸边：两层卡片边露在标题栏下方，暗示有内容 */}
        <If condition={hasStack}>
          <g className="pointer-events-none">
            {[2, 1].map(level => (
              <rect
                key={level}
                x={x + level * 6}
                y={y + titleHeight - slotRadius * 2}
                width={width - level * 12}
                height={slotRadius * 2 + (collapsedStackHeight / 2) * level}
                rx={slotRadius}
                ry={slotRadius}
                style={{
                  fill: COLUMN_COLORS.tray,
                  stroke: COLUMN_COLORS.line,
                  strokeWidth: 1,
                }}
              />
            ))}
          </g>
        </If>

        {/* 托盘：surface 实底 + 发丝线，拖入时边线转 accent */}
        <rect
          className="cursor-move"
          x={x}
          y={y}
          width={width}
          rx={borderRadius}
          ry={borderRadius}
          style={{
            height: trayHeight,
            transition: `height ${animationDuration}ms ${animationEasing}`,
            fill: isChildDraggingOver ? COLUMN_COLORS.trayDropOver : COLUMN_COLORS.tray,
            stroke: isChildDraggingOver ? COLUMN_COLORS.lineDropOver : COLUMN_COLORS.line,
            strokeWidth: 1,
          }}
        />

        {/* 顶部色带：裁成托盘的上圆角 */}
        {colorToken && (
          <>
            <clipPath id={`column-band-clip-${element.id}`}>
              <rect
                x={x}
                y={y}
                width={width}
                height={borderRadius * 2 + colorBandHeight}
                rx={borderRadius}
                ry={borderRadius}
              />
            </clipPath>
            <rect
              className="pointer-events-none"
              x={x}
              y={y}
              width={width}
              height={colorBandHeight}
              clipPath={`url(#column-band-clip-${element.id})`}
              style={{ fill: colorToken }}
            />
          </>
        )}

        {/* 标题栏：标题 + 数量居中 */}
        <foreignObject x={x} y={y} width={width} height={titleHeight} className="border-none">
          <div
            className="group/column-head pointer-events-auto relative flex h-full cursor-move flex-col items-center justify-center"
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
              className="text-tau-body-lg min-w-5 max-w-full cursor-pointer select-none truncate font-semibold leading-5 outline-none"
              style={{ color: COLUMN_COLORS.title }}
              contentEditable={isEditingTitle}
              onBlur={handleTitleBlur}
              onPressEnter={handleTitleBlur}
            />
            <span
              className="text-tau-micro pointer-events-none select-none tabular-nums leading-4"
              style={{ color: COLUMN_COLORS.muted }}
            >
              {ColumnUtil.getCountLabel(element)}
            </span>
            {!board.readonly && (
              <button
                type="button"
                title={collapsed ? "展开" : "折叠"}
                className={cn(
                  "text-ink-3 hover:bg-hover hover:text-ink-1 absolute right-2 top-1/2 grid size-[22px] -translate-y-1/2 cursor-pointer place-items-center rounded-[4px] transition-opacity duration-150",
                  collapsed ? "opacity-100" : "opacity-0 group-hover/column-head:opacity-100"
                )}
                onPointerDown={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
                onDoubleClick={e => e.stopPropagation()}
                onClick={e => {
                  e.stopPropagation();
                  ColumnUtil.toggleCollapsed(board, element);
                }}
              >
                <ChevronDown
                  size={14}
                  strokeWidth={1.75}
                  className="transition-transform duration-200"
                  style={{ transform: collapsed ? "rotate(-90deg)" : undefined }}
                />
              </button>
            )}
          </div>
        </foreignObject>

        <line
          visibility={collapsed ? "hidden" : undefined}
          x1={x}
          y1={y + titleHeight}
          x2={x + width}
          y2={y + titleHeight}
          style={{ stroke: COLUMN_COLORS.line, strokeWidth: 1 }}
          className="pointer-events-none"
        />

        {/* 空列占位 */}
        <If condition={layout.isVisuallyEmpty}>
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

        {/* 落点占位块 */}
        {layout.placeholderY !== null && (
          <rect
            ref={placeholderRef}
            className="pointer-events-none"
            x={x + padding}
            y={layout.placeholderY}
            width={width - padding * 2}
            height={layout.placeholderHeight}
            rx={slotRadius}
            ry={slotRadius}
            style={{ fill: COLUMN_COLORS.placeholder }}
          />
        )}

        {/* 子元素：每个子元素下垫一张 surface 槽位（发丝线框），子元素自身背景画在其上。
            外层 g 把存储坐标平移到视觉位置，内层 g 承载 FLIP 动画；被拖拽的子元素最后渲染以浮在最上 */}
        <g>
          {React.Children.toArray(children)
            .map((child, index) => ({ child, childElement: element.children[index] }))
            .filter(({ childElement }) => !!childElement)
            .sort(
              (a, b) =>
                Number(a.childElement.id === draggingChildId) -
                Number(b.childElement.id === draggingChildId)
            )
            .map(({ child, childElement }) => {
              const isDragging = childElement.id === draggingChildId && !!draggingPosition;
              const offset = getVisualOffset(childElement);
              const dx = offset.x - (childElement.x - x);
              const dy = offset.y - (childElement.y - y);

              return (
                <g key={childElement.id} transform={`translate(${dx}, ${dy})`}>
                  <g
                    ref={node => {
                      if (node) itemRefs.current.set(childElement.id, node);
                      else itemRefs.current.delete(childElement.id);
                    }}
                    className={isDragging ? "pointer-events-none" : undefined}
                    style={
                      isDragging
                        ? { filter: `drop-shadow(0 10px 18px ${COLUMN_COLORS.dragShadow})` }
                        : undefined
                    }
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
                </g>
              );
            })}
        </g>

        {/* 底部「添加卡片」：悬停列时淡入，挂在托盘正下方（不占布局高度） */}
        <If condition={canAppend}>
          <foreignObject
            x={x}
            y={y + trayHeight}
            width={width}
            height={APPEND_BUTTON_HEIGHT}
            className="pointer-events-none overflow-visible"
          >
            <div className="flex h-full items-center">
              <button
                type="button"
                className="text-ink-3 hover:bg-hover hover:text-ink-1 text-tau-meta pointer-events-auto flex h-7 cursor-pointer items-center gap-1.5 rounded-[4px] px-2 opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover/column:opacity-100"
                onPointerDown={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
                onDoubleClick={e => e.stopPropagation()}
                onClick={e => {
                  e.stopPropagation();
                  void ColumnUtil.appendRichText(board, element);
                }}
              >
                <Plus size={14} strokeWidth={1.75} />
                添加卡片
              </button>
            </div>
          </foreignObject>
        </If>

        {/* Selection border and resize handles */}
        <If condition={isSelected}>
          <g>
            <rect
              className="pointer-events-none"
              x={x}
              y={y}
              width={width}
              height={visualHeight}
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
              height={visualHeight}
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
              height={visualHeight}
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
