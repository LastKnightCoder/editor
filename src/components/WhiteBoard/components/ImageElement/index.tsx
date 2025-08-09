import { memo, useMemo, useState, useEffect, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import If from "@/components/If";
import ResizeCircle from "../ResizeCircle";
import ArrowConnectPoint from "../ArrowConnectPoint";
import ArrowDropConnectPoint from "../ArrowDropConnectPoint";

import classnames from "classnames";

import { Board, EHandlerPosition, Point, ImageElement } from "../../types";
import { PointUtil } from "../../utils";
import { useBoard, useSelectState, useDropArrow } from "../../hooks";
import {
  SELECT_RECT_STROKE,
  SELECT_RECT_STROKE_WIDTH,
  SELECT_RECT_FILL_OPACITY,
  RESIZE_CIRCLE_FILL,
  RESIZE_CIRCLE_RADIUS,
  ARROW_CONNECT_POINT_FILL,
  ARROW_CONNECT_POINT_RADIUS,
} from "../../constants";
import {
  IMAGE_DESCRIPTION_HEIGHT,
  IMAGE_DESCRIPTION_PADDING,
  IMAGE_DESCRIPTION_MARGIN,
  IMAGE_DESCRIPTION_LIGHT_COLOR,
  IMAGE_DESCRIPTION_DARK_COLOR,
  IMAGE_DESCRIPTION_PLACEHOLDER,
  EDescriptionPosition,
  DEFAULT_DESCRIPTION,
  DEFAULT_DESCRIPTION_POSITION,
  DEFAULT_DESCRIPTION_ALIGNMENT,
  DEFAULT_DESCRIPTION_FONT_SIZE,
} from "../../constants/image";
import EditText, { EditTextHandle } from "@/components/EditText";
import useTheme from "@/hooks/useTheme";
import LocalImage from "@/components/LocalImage";

import styles from "./index.module.less";

interface ImageElementProps {
  element: ImageElement;
  onResizeStart?: (element: ImageElement, startPoint: Point) => void;
  onResize: (
    board: Board,
    element: ImageElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
    isPreserveRatio?: boolean,
    isAdsorb?: boolean,
  ) => void;
  onResizeEnd?: (
    board: Board,
    element: ImageElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
  ) => void;
}

const ImageElementComponent = memo((props: ImageElementProps) => {
  const { element, onResize, onResizeStart, onResizeEnd } = props;

  const {
    id,
    x,
    y,
    width,
    height,
    src,
    showDescription = false,
    description = DEFAULT_DESCRIPTION,
    descriptionPosition = DEFAULT_DESCRIPTION_POSITION,
    descriptionAlignment = DEFAULT_DESCRIPTION_ALIGNMENT,
  } = element;

  const { isDark } = useTheme();

  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [tempDescription, setTempDescription] = useState(description);
  const editTextRef = useRef<EditTextHandle>(null);

  useEffect(() => {
    setTempDescription(description);
  }, [description]);

  const board = useBoard();
  const { isSelected } = useSelectState(id);

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

  const handleDescriptionChange = useMemoizedFn((value: string) => {
    setTempDescription(value);
  });

  const handleDescriptionPressEnter = useMemoizedFn(() => {
    setIsEditingDescription(false);
    saveDescription();
  });

  const saveDescription = useMemoizedFn(() => {
    if (tempDescription !== description) {
      const path = board.children.findIndex((item) => item.id === id);
      if (path !== -1) {
        board.apply({
          type: "set_node",
          path: [path],
          properties: element,
          newProperties: {
            ...element,
            description: tempDescription,
          },
        });
      }
    }
  });

  const handleDescriptionClick = useMemoizedFn((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSelected && !isEditingDescription) {
      setIsEditingDescription(true);
    }
  });

  const handleKeyDown = useMemoizedFn((e: React.KeyboardEvent) => {
    // 阻止删除键冒泡，防止删除图片
    if (e.key === "Backspace" || e.key === "Delete") {
      e.stopPropagation();
    }
  });

  const stopPropagation = useMemoizedFn((e: React.MouseEvent) => {
    e.stopPropagation();
  });

  const handleDoubleClickDescription = useMemoizedFn((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditingDescription(true);
    // 这里提前设置为 true，这样才能 focus，通过 React 状态同步就晚了
    editTextRef.current?.setContentEditable(true);
    editTextRef.current?.focusEnd();
  });

  // 获取描述文字颜色
  const descriptionColor =
    element.descriptionStyle?.color ||
    (isDark ? IMAGE_DESCRIPTION_DARK_COLOR : IMAGE_DESCRIPTION_LIGHT_COLOR);

  // 获取描述文字大小
  const descriptionFontSize =
    element.descriptionStyle?.fontSize || DEFAULT_DESCRIPTION_FONT_SIZE;

  const descriptionBackgroundColor =
    element.descriptionStyle?.backgroundColor || "transparent";
  const descriptionBorderColor =
    element.descriptionStyle?.borderColor || "transparent";

  // 计算描述区域高度 - 根据字体大小动态调整
  const descriptionHeight = Math.max(
    IMAGE_DESCRIPTION_HEIGHT,
    descriptionFontSize * 2.5,
  );

  // 计算描述的位置
  const descriptionY =
    descriptionPosition === EDescriptionPosition.TOP
      ? y - descriptionHeight - IMAGE_DESCRIPTION_MARGIN
      : y + height + IMAGE_DESCRIPTION_MARGIN;

  // 描述文本样式
  const descriptionTextStyle = {
    color: descriptionColor,
    fontSize: `${descriptionFontSize}px`,
    padding: IMAGE_DESCRIPTION_PADDING,
    lineHeight: "1.4",
    overflow: "hidden",
    backgroundColor: descriptionBackgroundColor,
    borderColor: descriptionBorderColor,
    borderWidth: 2,
    borderRadius: 8,
  };

  return (
    <>
      {showDescription && (
        <foreignObject
          x={x}
          y={descriptionY}
          width={width}
          height={descriptionHeight}
          style={{
            userSelect: "none",
            pointerEvents: "auto",
          }}
          onPointerDown={stopPropagation}
          onPointerUp={stopPropagation}
          onWheel={stopPropagation}
          onDoubleClick={stopPropagation}
        >
          <div
            className={classnames(styles.descriptionContainer, {
              [styles[descriptionAlignment]]: true,
            })}
            onClick={handleDescriptionClick}
            onKeyDown={handleKeyDown}
            onDoubleClick={handleDoubleClickDescription}
          >
            <EditText
              ref={editTextRef}
              defaultValue={tempDescription}
              onChange={handleDescriptionChange}
              onPressEnter={handleDescriptionPressEnter}
              contentEditable={isEditingDescription}
              defaultFocus={isEditingDescription}
              className={classnames(
                styles.descriptionText,
                styles[descriptionAlignment],
                {
                  "hidden!": !isEditingDescription && !description.trim(),
                },
              )}
              style={descriptionTextStyle}
              onBlur={handleDescriptionPressEnter}
            />
            {!isEditingDescription && !description.trim() && (
              <span style={descriptionTextStyle}>
                {IMAGE_DESCRIPTION_PLACEHOLDER}
              </span>
            )}
          </div>
        </foreignObject>
      )}

      <foreignObject
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          userSelect: "none",
        }}
      >
        <LocalImage
          url={src}
          alt={description}
          width={width}
          height={height}
          className="object-contain select-none object-center"
          draggable={false}
          onDoubleClick={stopPropagation}
        />
      </foreignObject>

      <If condition={isSelected}>
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
              cx={point.x}
              cy={point.y}
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
    </>
  );
});

export default ImageElementComponent;
