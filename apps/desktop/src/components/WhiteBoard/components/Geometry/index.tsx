import { memo, useEffect, useMemo, useRef, useState } from "react";
import { getDescriptionKit } from "@/services/editorKit";
import { useMemoizedFn } from "ahooks";
import { Descendant } from "slate";
import classnames from "classnames";

import If from "@/components/If";
import { Editor, EditorRef, EditorThemeOverride } from "@tau/editor/src";
import type { IHotKeyConfig } from "@tau/editor/src";
import ResizeCircle from "../ResizeCircle";
import ArrowConnectPointGroup from "../ArrowConnectPointGroup";
import ArrowDropConnectPoint from "../ArrowDropConnectPoint";
import GeometryRenderer from "./GeometryRenderer";

import { Board, EHandlerPosition, Point } from "../../types";
import { PathUtil, PointUtil } from "../../utils";
import { useBoard, useSelectState, useDropArrow } from "../../hooks";
import { GeometryElement } from "../../plugins";
import {
  SELECT_RECT_STROKE,
  SELECT_RECT_STROKE_WIDTH,
  SELECT_RECT_FILL_OPACITY,
  RESIZE_CIRCLE_FILL,
  RESIZE_CIRCLE_RADIUS,
} from "../../constants";
import { registerGeometryRenderers } from "./registerGeometryRenderers";
import styles from "./index.module.less";

interface GeometryProps {
  element: GeometryElement;
  onResizeStart?: (element: GeometryElement, startPoint: Point) => void;
  onResize: (
    board: Board,
    element: GeometryElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
    isPreserveRatio?: boolean,
    isAdsorb?: boolean
  ) => void;
  onResizeEnd?: (
    board: Board,
    element: GeometryElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point
  ) => void;
}

registerGeometryRenderers();

const Geometry = memo((props: GeometryProps) => {
  const { element, onResize, onResizeStart, onResizeEnd } = props;

  const {
    id,
    x,
    y,
    width,
    height,
    fillOpacity,
    fill,
    stroke,
    strokeWidth,
    strokeOpacity,
    text,
    color,
    theme,
  } = element;

  const [isEditing, setIsEditing] = useState(false);

  const board = useBoard();
  const { isSelected } = useSelectState(id);
  const geometryRef = useRef<SVGGElement>(null);
  const textRef = useRef<EditorRef>(null);
  const [textContent] = useState(text.content);

  const { isMoveArrowClosing, activeConnectId, arrowConnectPoints, arrowConnectExtendPoints } =
    useDropArrow(element);

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

  const addEditingElement = useMemoizedFn(() => {
    board.isEditingElements = [...board.isEditingElements.filter(eid => eid !== id), id];
  });

  const removeEditingElement = useMemoizedFn(() => {
    board.isEditingElements = board.isEditingElements.filter(eid => eid !== id);
  });

  const finishEditing = useMemoizedFn(() => {
    setIsEditing(false);
    removeEditingElement();
    textRef.current?.deselect();
    board.apply(
      [
        {
          type: "set_selection",
          properties: board.selection,
          newProperties: {
            selectArea: null,
            selectedElements: [element],
          },
        },
      ],
      false
    );
  });

  const handleOnFocus = useMemoizedFn(() => {
    setIsEditing(true);
    addEditingElement();
  });

  const handleOnBlur = useMemoizedFn(() => {
    // 延迟设为 readonly
    setTimeout(() => {
      setIsEditing(false);
      removeEditingElement();
      textRef.current?.deselect();
    }, 100);
  });

  const handleDbClick = useMemoizedFn((e: MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    addEditingElement();
    setTimeout(() => {
      textRef.current?.focus();
    });
    board.apply(
      [
        {
          type: "set_selection",
          properties: board.selection,
          newProperties: {
            selectArea: null,
            selectedElements: [],
          },
        },
      ],
      false
    );
  });

  const handlePointerDown = useMemoizedFn((e: MouseEvent) => {
    // 禁止移动元素，需要选中文字
    if (isEditing) {
      e.stopPropagation();
    }
  });

  const handleTextContentChange = useMemoizedFn((content: Descendant[]) => {
    const path = PathUtil.getPathByElement(board, element);
    if (!path) return;
    const nextText = {
      ...text,
      content,
    };
    board.apply(
      [
        {
          type: "set_node",
          path,
          properties: { text: element.text },
          newProperties: { text: nextText },
        },
      ],
      false
    );
  });

  const geometryHotkeyConfigs = useMemo<IHotKeyConfig[]>(
    () => [
      {
        hotKey: "enter",
        action: (_editor, event) => {
          if (!isEditing) return;
          if (event.nativeEvent.isComposing) return;
          if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;

          event.preventDefault();
          event.stopPropagation();
          finishEditing();
        },
      },
    ],
    [finishEditing, isEditing]
  );

  useEffect(() => {
    const container = geometryRef.current;
    if (!container) return;

    container.addEventListener("dblclick", handleDbClick);
    container.addEventListener("pointerdown", handlePointerDown);

    return () => {
      if (container) {
        container.removeEventListener("dblclick", handleDbClick);
        container.removeEventListener("pointerdown", handlePointerDown);
      }
    };
  }, [handleDbClick, handlePointerDown]);

  return (
    <g ref={geometryRef}>
      <svg
        className={styles.svgContainer}
        key={id}
        x={x}
        y={y}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
      >
        <GeometryRenderer
          element={element}
          width={width}
          height={height}
          fill={fill}
          fillOpacity={fillOpacity}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeOpacity={strokeOpacity}
        />
      </svg>
      <foreignObject x={x} y={y} width={width} height={height} className="border-none">
        <div
          className={classnames(styles.textContainer, styles[text.align], {
            [styles.readonly]: !isEditing,
          })}
          style={{ color }}
        >
          {/* 图形可单独指定文字明暗（深色填充配浅色字），未指定时跟随宿主 */}
          <EditorThemeOverride mode={theme}>
            <Editor
              kit={getDescriptionKit()}
              ref={textRef}
              initValue={textContent}
              onFocus={handleOnFocus}
              onBlur={handleOnBlur}
              readonly={!isEditing}
              onChange={handleTextContentChange}
              hotkeyConfigs={geometryHotkeyConfigs}
            />
          </EditorThemeOverride>
        </div>
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
        </g>
      </If>
      <ArrowConnectPointGroup
        element={element}
        points={arrowConnectExtendPoints}
        proximityBounds={{ x, y, width, height }}
        isSelected={isSelected}
        disabled={isMoveArrowClosing}
      />
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
});

export default Geometry;
