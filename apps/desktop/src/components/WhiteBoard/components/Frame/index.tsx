import { memo, useState, useRef, useEffect, useMemo } from "react";
import { useMemoizedFn } from "ahooks";

import { EHandlerPosition, Point, Board, FrameElement } from "../../types";
import { useBoard, useSelectState, useDropArrow, useSketch } from "../../hooks";
import { FrameUtil, PathUtil, PointUtil } from "../../utils";
import ResizeCircle from "../ResizeCircle";
import ArrowConnectPointGroup from "../ArrowConnectPointGroup";
import ArrowDropConnectPoint from "../ArrowDropConnectPoint";
import SketchRect from "../SketchPaths/SketchRect";
import If from "@/components/If";
import { cn as classnames } from "@tau/ui";
import { EditText, EditTextHandle } from "@tau/ui";

import {
  SELECT_RECT_STROKE,
  SELECT_RECT_STROKE_WIDTH,
  SELECT_RECT_FILL_OPACITY,
  RESIZE_CIRCLE_FILL,
  RESIZE_CIRCLE_RADIUS,
} from "../../constants";
import { handTextClass } from "../../utils/sketch";

const getReadableTextColor = (hex: string): string => {
  const m = hex.replace("#", "");
  if (m.length !== 6 && m.length !== 3) return "#ffffff";
  const full =
    m.length === 3
      ? m
          .split("")
          .map(c => c + c)
          .join("")
      : m;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const lum = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return lum > 0.6 ? "#1f2937" : "#ffffff";
};

interface FrameProps {
  element: FrameElement;
  onClick?: (e: React.MouseEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  onResizeStart?: (element: FrameElement, startPoint: Point) => void;
  onResize: (
    board: Board,
    element: FrameElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
    isPreserveRatio?: boolean,
    isAdsorb?: boolean
  ) => void;
  onResizeEnd?: (
    board: Board,
    element: FrameElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point
  ) => void;
}

const Frame = memo(
  ({ element, onClick, onDoubleClick, onResize, onResizeStart, onResizeEnd }: FrameProps) => {
    const board = useBoard();
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const titleRef = useRef<EditTextHandle>(null);
    const frameRef = useRef<SVGGElement>(null);

    const {
      x,
      y,
      width,
      height,
      title,
      backgroundColor,
      borderColor,
      borderWidth,
      borderRadius,
      isChildMoveIn,
    } = element;

    const { isSelected: isFrameSelected } = useSelectState(element.id);
    const sketch = useSketch(element);
    // 拖入子元素时的虚线高亮是交互反馈，保持普通描边
    const sketchBorder = sketch.enabled && !isChildMoveIn;
    const { isMoveArrowClosing, activeConnectId, arrowConnectPoints, arrowConnectExtendPoints } =
      useDropArrow(element, { container: true });

    const [resizePoints] = useMemo(() => {
      const resizePoints = PointUtil.getResizePointFromRect({
        x,
        y,
        width,
        height,
      });
      return [resizePoints];
    }, [x, y, width, height]);

    const handleTitleBlur = () => {
      setIsEditingTitle(false);
      titleRef.current?.blur();
      const newTitle = titleRef.current?.getValue() || "";
      const framePath = PathUtil.getPathByElement(board, element);
      if (framePath) {
        board.apply([
          {
            type: "set_node",
            path: framePath,
            properties: { title: element.title },
            newProperties: { title: newTitle },
          },
        ]);
      }
    };

    const handleFrameClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onClick?.(e);
    };

    const handleFrameDoubleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onDoubleClick?.(e);
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

    const handleOnResizeEnd = useMemoizedFn(
      (position: EHandlerPosition, startPoint: Point, endPoint: Point) => {
        onResizeEnd?.(board, element, position, startPoint, endPoint);
      }
    );

    useEffect(() => {
      if (isEditingTitle && titleRef.current) {
        titleRef.current.focus();
      }
    }, [isEditingTitle]);

    const isInlineTitle = element.titlePosition === "inline";
    const effectiveBorderWidth = isChildMoveIn ? borderWidth + 1 : borderWidth;
    const borderInset = effectiveBorderWidth / 2;
    const INLINE_TITLE_HEIGHT = FrameUtil.INLINE_TITLE_HEIGHT;
    const inlineRadius = Math.max(0, borderRadius - borderInset);
    const titleTextColor = getReadableTextColor(borderColor);
    const titleHeight = isInlineTitle ? INLINE_TITLE_HEIGHT : FrameUtil.TITLE_HEIGHT;
    const titleY = isInlineTitle ? y + borderInset : FrameUtil.getTitleY(element);
    const titleObjectX = isInlineTitle ? x + borderInset : x;

    return (
      <g ref={frameRef}>
        <rect
          className="cursor-move"
          x={x}
          y={y}
          width={width}
          height={height}
          fill={backgroundColor}
          stroke={sketchBorder ? "none" : borderColor}
          strokeWidth={isChildMoveIn ? borderWidth + 1 : borderWidth}
          strokeDasharray={isChildMoveIn ? "8 8" : "0"}
          rx={borderRadius}
          ry={borderRadius}
          onClick={handleFrameClick}
          onDoubleClick={handleFrameDoubleClick}
        />
        {sketchBorder && (
          <SketchRect
            x={x}
            y={y}
            width={width}
            height={height}
            radius={borderRadius}
            stroke={borderColor}
            strokeWidth={borderWidth}
            level="neat"
            seed={sketch.seed}
          />
        )}

        {/* 标题区域 - 移到选中状态之前，避免遮挡箭头连接点 */}
        <foreignObject
          x={titleObjectX}
          y={titleY}
          width={width}
          height={titleHeight}
          className="border-none"
          style={{ pointerEvents: isInlineTitle ? "none" : undefined }}
        >
          <div
            className="pointer-events-auto flex h-full w-fit items-center"
            onPointerDown={e => {
              e.stopPropagation();
            }}
            onWheel={e => {
              e.stopPropagation();
            }}
            onDoubleClick={e => {
              e.stopPropagation();
              setIsEditingTitle(true);
              // 这里提前设置为 true，这样才能 focus，通过 React 状态同步就晚了
              titleRef.current?.setContentEditable(true);
              titleRef.current?.focusEnd();
            }}
          >
            <EditText
              id={`frame-title-${element.id}`}
              ref={titleRef}
              defaultValue={title || "Frame"}
              className={classnames(
                isInlineTitle
                  ? "flex h-full w-fit min-w-5 cursor-pointer select-none items-center pl-2.5 pr-3 text-center text-xs font-semibold tracking-wide outline-none hover:opacity-95"
                  : "flex h-full w-fit min-w-5 cursor-pointer select-none items-center rounded-lg px-2 py-1 text-center text-sm font-medium outline-none hover:opacity-90",
                handTextClass(sketch)
              )}
              style={{
                background: borderColor,
                color: titleTextColor,
                borderRadius: isInlineTitle ? `${inlineRadius}px 0px 6px 0px` : undefined,
                textShadow:
                  titleTextColor === "#ffffff"
                    ? "0 1px 1px rgba(0,0,0,0.25)"
                    : "0 1px 1px rgba(255,255,255,0.25)",
              }}
              contentEditable={isEditingTitle}
              onBlur={handleTitleBlur}
              onPressEnter={handleTitleBlur}
            />
          </div>
        </foreignObject>

        {/* 选中时的边框高亮 */}
        <If condition={isFrameSelected}>
          <g>
            <rect
              className="pointer-events-none"
              x={x}
              y={y}
              width={width}
              height={height}
              fillOpacity={SELECT_RECT_FILL_OPACITY}
              stroke={SELECT_RECT_STROKE}
              strokeWidth={SELECT_RECT_STROKE_WIDTH}
            />
            {Object.entries(resizePoints).map(([position, point]) => (
              <ResizeCircle
                key={position}
                cx={(point as Point).x}
                cy={(point as Point).y}
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
          isSelected={isFrameSelected}
          disabled={isMoveArrowClosing}
        />

        {/* 箭头连接点 */}
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

Frame.displayName = "Frame";

export default Frame;
