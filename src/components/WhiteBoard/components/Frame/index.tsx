import { memo, useState, useRef, useEffect, useMemo } from "react";
import { useMemoizedFn } from "ahooks";

import { EHandlerPosition, Point, Board, FrameElement } from "../../types";
import { useBoard, useSelectState, useDropArrow } from "../../hooks";
import { PathUtil, PointUtil } from "../../utils";
import ResizeCircle from "../ResizeCircle";
import ArrowConnectPoint from "../ArrowConnectPoint";
import ArrowDropConnectPoint from "../ArrowDropConnectPoint";
import If from "@/components/If";
import EditText, { EditTextHandle } from "@/components/EditText";

import styles from "./index.module.less";
import {
  SELECT_RECT_STROKE,
  SELECT_RECT_STROKE_WIDTH,
  SELECT_RECT_FILL_OPACITY,
  RESIZE_CIRCLE_FILL,
  RESIZE_CIRCLE_RADIUS,
  ARROW_CONNECT_POINT_FILL,
  ARROW_CONNECT_POINT_RADIUS,
} from "../../constants";

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
    isAdsorb?: boolean,
  ) => void;
  onResizeEnd?: (
    board: Board,
    element: FrameElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
  ) => void;
}

const Frame = memo(
  ({
    element,
    onClick,
    onDoubleClick,
    onResize,
    onResizeStart,
    onResizeEnd,
  }: FrameProps) => {
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
    const {
      isMoveArrowClosing,
      activeConnectId,
      arrowConnectPoints,
      arrowConnectExtendPoints,
    } = useDropArrow(element);

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
            properties: element,
            newProperties: {
              ...element,
              title: newTitle,
            },
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

    const handleOnResizeEnd = useMemoizedFn(
      (position: EHandlerPosition, startPoint: Point, endPoint: Point) => {
        onResizeEnd?.(board, element, position, startPoint, endPoint);
      },
    );

    useEffect(() => {
      if (isEditingTitle && titleRef.current) {
        titleRef.current.focus();
      }
    }, [isEditingTitle]);

    const titleHeight = 40;
    const titleY = y - titleHeight - 10;

    return (
      <g ref={frameRef}>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={backgroundColor}
          stroke={borderColor}
          strokeWidth={isChildMoveIn ? borderWidth + 1 : borderWidth}
          strokeDasharray={isChildMoveIn ? "8 8" : "0"}
          rx={borderRadius}
          ry={borderRadius}
          className={styles.frame}
          onClick={handleFrameClick}
          onDoubleClick={handleFrameDoubleClick}
        />

        {/* 选中时的边框高亮 */}
        <If condition={isFrameSelected}>
          <g>
            <rect
              x={x}
              y={y}
              width={width}
              height={height}
              fillOpacity={SELECT_RECT_FILL_OPACITY}
              stroke={SELECT_RECT_STROKE}
              strokeWidth={SELECT_RECT_STROKE_WIDTH}
              style={{ pointerEvents: "none" }}
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
            {arrowConnectExtendPoints.map((point) => (
              <ArrowConnectPoint
                key={point.connectId}
                element={element}
                connectId={point.connectId}
                x={point.point.x}
                y={point.point.y}
                r={ARROW_CONNECT_POINT_RADIUS}
                fill={ARROW_CONNECT_POINT_FILL}
              />
            ))}
          </g>
        </If>

        {/* 标题区域 */}
        <foreignObject
          x={x}
          y={titleY}
          width={width}
          height={titleHeight}
          className={styles.titleContainer}
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
          onWheel={(e) => {
            e.stopPropagation();
          }}
        >
          <div
            className={styles.titleWrapper}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setIsEditingTitle(true);
              // 这里提前设置为 true，这样才能 focus，通过 React 状态同步就晚了
              titleRef.current?.setContentEditable(true);
              titleRef.current?.focusEnd();
            }}
          >
            <EditText
              ref={titleRef}
              defaultValue={title || "Frame"}
              className={styles.titleText}
              style={{
                background: borderColor,
              }}
              contentEditable={isEditingTitle}
              onBlur={handleTitleBlur}
              onPressEnter={handleTitleBlur}
            />
          </div>
        </foreignObject>

        {/* 箭头连接点 */}
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

Frame.displayName = "Frame";

export default Frame;
