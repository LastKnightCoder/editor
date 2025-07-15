import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Descendant } from "slate";
import { useMemoizedFn } from "ahooks";
import useUploadResource from "@/hooks/useUploadResource.ts";
import {
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
} from "@/editor-extensions";
import Editor, { EditorRef } from "@/components/Editor";
import If from "@/components/If";
import ErrorBoundary from "@/components/ErrorBoundary";
import ResizeCircle from "../ResizeCircle";

import useHandleResize from "./hooks/useHandleResize";
import useHandlePointer from "./hooks/useHandlePointer";
import {
  SELECT_RECT_STROKE,
  SELECT_RECT_STROKE_WIDTH,
  SELECT_RECT_FILL_OPACITY,
  RESIZE_CIRCLE_FILL,
  RESIZE_CIRCLE_RADIUS,
  ARROW_CONNECT_POINT_RADIUS,
  ARROW_CONNECT_POINT_FILL,
} from "../../constants";
import { Board, BoardElement, EHandlerPosition, Point } from "../../types";
import { RichTextElement, CommonElement } from "../../plugins";
import { PointUtil } from "../../utils";
import {
  useBoard,
  useSelectState,
  useDropArrow,
  useArrowMove,
} from "../../hooks";

import styles from "./index.module.less";
import ArrowConnectPoint from "../ArrowConnectPoint";
import ArrowDropConnectPoint from "../ArrowDropConnectPoint";

const customExtensions = [
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
];

type RichTextNodeType = Omit<RichTextElement, "type"> & any;

interface RichTextProps {
  element: RichTextNodeType;
  onContentChange: (
    board: Board,
    element: RichTextNodeType,
    value: Descendant[],
  ) => void;
  onEditorSizeChange: (
    board: Board,
    element: RichTextNodeType,
    width: number,
    height: number,
  ) => void;
  removeAutoFocus?: (board: Board, element: RichTextNodeType) => void;
  onResizeStart?: (element: CommonElement & any, startPoint: Point) => void;
  onResizeEnd?: (
    board: Board,
    element: CommonElement & any,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
  ) => void;
  onResize: (
    board: Board,
    element: CommonElement & any,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
    isPreserveRatio?: boolean,
    isAdsorb?: boolean,
  ) => void;
}

export interface RichtextRef {
  setEditorValue: (value: Descendant[]) => void;
}

const PADDING_WIDTH = 20;
const PADDING_HEIGHT = 20;

const Richtext = forwardRef<RichtextRef, RichTextProps>(
  (props: RichTextProps, ref) => {
    const {
      element,
      onResizeStart,
      onResizeEnd,
      onResize,
      onContentChange,
      onEditorSizeChange,
      removeAutoFocus,
    } = props;

    const {
      x,
      y,
      width,
      height,
      id: elementId,
      content,
      maxWidth,
      maxHeight,
      resized,
      readonly,
      autoFocus,
      paddingWidth = PADDING_WIDTH,
      paddingHeight = PADDING_HEIGHT,
      topColor,
      background,
      color,
      theme,
    } = element;

    const containerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<EditorRef>(null);
    const [initValue] = useState(content);
    const [focus, setFocus] = useState(false);
    const board = useBoard();
    const isArrowMoving = useArrowMove();
    const [isMoving, setIsMoving] = useState(false);

    useImperativeHandle(ref, () => ({
      setEditorValue: (value: Descendant[]) => {
        editorRef.current?.setEditorValue(value);
      },
    }));

    const {
      isMoveArrowClosing,
      activeConnectId,
      arrowConnectPoints,
      arrowConnectExtendPoints,
    } = useDropArrow(element);
    const { isSelected, isSelecting } = useSelectState(elementId);

    const [resizePoints] = useMemo(() => {
      const resizePoints = PointUtil.getResizePointFromRect({
        x,
        y,
        width,
        height,
      });

      return [resizePoints];
    }, [x, y, width, height]);

    const handleFocus = useMemoizedFn(() => {
      if (readonly) return;
      setFocus(true);
      board.isEditingElements = [
        ...board.isEditingElements.filter((eid) => eid !== elementId),
        elementId,
      ];
    });

    const handleBlur = useMemoizedFn(() => {
      if (readonly) return;
      handleResize.flush();
      setTimeout(() => {
        setFocus(false);
        board.isEditingElements = board.isEditingElements.filter(
          (eid) => eid !== elementId,
        );
        // 按道理 blur 的时候取消选中，但是这个时候如果想通过工具栏改变样式就没法做到了
        // 暂时不 deselect 了，后续改为右键菜单的时候在改回来
        // editorRef.current?.deselect();
      }, 100);
    });

    const handleOnContentChange = useMemoizedFn((value: Descendant[]) => {
      onContentChange(board, element, value);
    });

    const handleOnEditorSizeChange = useMemoizedFn(
      (width: number, height: number) => {
        onEditorSizeChange(board, element, width, height);
      },
    );

    const handleRemoveAutoFocus = useMemoizedFn(() => {
      removeAutoFocus?.(board, element);
    });

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

    const containerStyle = useMemo(() => {
      return {
        pointerEvents:
          isArrowMoving || isMoving || isSelecting || isSelected
            ? "none"
            : "auto",
        userSelect:
          isArrowMoving || isMoving || isSelecting || isSelected
            ? "none"
            : "auto",
        background: "transparent",
        color,
        cursor: isSelected ? "move" : "auto",
      } as React.CSSProperties;
    }, [isMoving, isSelecting, isSelected, color, isArrowMoving]);

    const handleAutoFocus = useMemoizedFn(() => {
      if (autoFocus) {
        editorRef.current?.focus();
        handleRemoveAutoFocus();
      }
    });

    useEffect(() => {
      handleAutoFocus();
    }, [handleAutoFocus]);

    const uploadResource = useUploadResource();

    const { handleResize, editorStyle } = useHandleResize({
      handleOnEditorSizeChange,
      maxWidth,
      maxHeight,
      container: containerRef.current,
      resized,
      paddingWidth,
      paddingHeight,
      focus,
      isMoving: isMoving || isArrowMoving,
      isSelected,
    });
    useHandlePointer({
      container: containerRef.current,
      paddingWidth,
      paddingHeight,
      isSelected,
      width,
      height,
    });

    useEffect(() => {
      const onMovingChange = (movingElements: BoardElement[]) => {
        setIsMoving(movingElements.some((element) => element.id === elementId));
      };
      const onMovingEnd = () => {
        setIsMoving(false);
      };
      board.on("element:move", onMovingChange);
      board.on("element:move-end", onMovingEnd);

      return () => {
        board.off("element:move", onMovingChange);
        board.off("element:move-end", onMovingEnd);
      };
    }, [board, elementId]);

    useEffect(() => {
      const container = containerRef.current;

      if (!container) return;

      const editor = container.querySelector(":scope > [data-slate-editor]");
      if (!editor) return;

      const stopWheelPropagation = (e: WheelEvent) => {
        // 怎么判断是否滚动到底部
        const clientHeight = editor.clientHeight;
        const scrollTop = editor.scrollTop;
        const scrollHeight = editor.scrollHeight;
        const isScrollToBottom = scrollTop + clientHeight >= scrollHeight;
        // 获取滚动方向
        const isUp = e.deltaY < 0;
        if ((isUp && scrollTop !== 0) || (!isUp && !isScrollToBottom)) {
          e.stopPropagation();
        }
      };

      // @ts-expect-error
      editor.addEventListener("wheel", stopWheelPropagation);

      return () => {
        // @ts-expect-error
        editor.removeEventListener("wheel", stopWheelPropagation);
      };
    }, []);

    return (
      <>
        <foreignObject
          x={x}
          y={y}
          width={focus && !resized ? maxWidth : width}
          height={focus && !resized ? maxHeight : height}
        >
          <div
            id={`rich-text-container-${elementId}`}
            className={styles.richTextContainer}
            ref={containerRef}
            style={containerStyle}
            onDoubleClick={(e) => {
              e.stopPropagation();
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width,
                height,
                background: background || "transparent",
                borderRadius: 4,
                zIndex: -1,
              }}
            />
            {topColor && (
              <div
                className={styles.borderTop}
                style={{ background: topColor }}
              ></div>
            )}
            <ErrorBoundary>
              <Editor
                ref={editorRef}
                style={editorStyle}
                className={styles.editor}
                initValue={initValue}
                onChange={handleOnContentChange}
                readonly={readonly}
                onFocus={handleFocus}
                onBlur={handleBlur}
                uploadResource={uploadResource}
                extensions={customExtensions}
                theme={theme}
              />
            </ErrorBoundary>
          </div>
        </foreignObject>
        <If condition={isSelected}>
          <g>
            <rect
              x={x}
              y={y}
              rx={4}
              ry={4}
              width={width}
              height={height}
              fillOpacity={SELECT_RECT_FILL_OPACITY}
              stroke={SELECT_RECT_STROKE}
              strokeWidth={SELECT_RECT_STROKE_WIDTH}
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
  },
);

export default Richtext;
