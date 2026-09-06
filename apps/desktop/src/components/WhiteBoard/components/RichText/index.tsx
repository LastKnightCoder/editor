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
import { App } from "antd";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import { EditorRef } from "@tau/editor/src";
import Editor from "@/components/ContentEditor";
import useEditContent from "@/hooks/useEditContent";
import { createContent, updateContent } from "@/commands/content";
import { getContentLength } from "@/utils";
import If from "@/components/If";
import ErrorBoundary from "@/components/ErrorBoundary";
import ResizeCircle from "../ResizeCircle";
import ArrowConnectPointGroup from "../ArrowConnectPointGroup";

import useHandleResize from "./hooks/useHandleResize";
import useHandlePointer from "./hooks/useHandlePointer";
import {
  SELECT_RECT_STROKE,
  SELECT_RECT_STROKE_WIDTH,
  SELECT_RECT_FILL_OPACITY,
  RESIZE_CIRCLE_FILL,
  RESIZE_CIRCLE_RADIUS,
} from "../../constants";
import { Board, ECreateBoardElementType, EHandlerPosition, Point } from "../../types";
import { RichTextElement, CommonElement } from "../../plugins";
import { PointUtil } from "../../utils";
import { getShadowStyle } from "../../constants";
import {
  useBoard,
  useElementMoving,
  useSelectState,
  useDropArrow,
  useArrowMove,
  useCreateElementType,
  useInertControl,
} from "../../hooks";
import { useBoardState } from "../../hooks/useBoardState";
import { useViewPort } from "../../hooks/useViewPort";
import useTheme from "@/hooks/useTheme";

import styles from "./index.module.less";
import ArrowDropConnectPoint from "../ArrowDropConnectPoint";

type RichTextNodeType = Omit<RichTextElement, "type"> & any;

interface RichTextProps {
  element: RichTextNodeType;
  onContentChange: (board: Board, element: RichTextNodeType, value: Descendant[]) => void;
  onEditorSizeChange: (
    board: Board,
    element: RichTextNodeType,
    width: number,
    height: number
  ) => void;
  onElementChange?: (
    board: Board,
    element: RichTextNodeType,
    patch: Partial<RichTextNodeType>
  ) => void;
  removeAutoFocus?: (board: Board, element: RichTextNodeType) => void;
  onResizeStart?: (element: CommonElement & any, startPoint: Point) => void;
  onResizeEnd?: (
    board: Board,
    element: CommonElement & any,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point
  ) => void;
  onResize: (
    board: Board,
    element: CommonElement & any,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
    isPreserveRatio?: boolean,
    isAdsorb?: boolean
  ) => void;
}

export interface RichtextRef {
  setEditorValue: (value: Descendant[]) => void;
}

const PADDING_WIDTH = 20;
const PADDING_HEIGHT = 20;
const isSameContent = (a: Descendant[], b: Descendant[]) => JSON.stringify(a) === JSON.stringify(b);

const Richtext = forwardRef<RichtextRef, RichTextProps>((props: RichTextProps, ref) => {
  const {
    element,
    onResizeStart,
    onResizeEnd,
    onResize,
    onContentChange,
    onEditorSizeChange,
    onElementChange,
    removeAutoFocus,
  } = props;

  const {
    x,
    y,
    width,
    height,
    id: elementId,
    content,
    contentId,
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
    shadowSize,
    resizable = true,
    autoHeight = false,
  } = element;
  const { message } = App.useApp();
  const dynamicExtensions = useDynamicExtensionsStore(state => state.extensions);
  const textColor = color || "#1f1f1f";
  const { isDark } = useTheme();

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorRef>(null);
  const [initValue, setInitialState] = useState(content);
  const latestContentRef = useRef(content);
  const pendingContentIdPromiseRef = useRef<Promise<number> | null>(null);
  const [focus, setFocus] = useState(false);
  const board = useBoard();
  const isArrowMoving = useArrowMove();
  const createBoardElementType = useCreateElementType();
  const isMoving = useElementMoving(elementId);
  const viewPort = useViewPort();
  const boardState = useBoardState();

  const isCreatingElement = createBoardElementType !== ECreateBoardElementType.None;
  const { isSelected, isSelecting } = useSelectState(elementId);
  const shouldInert = isArrowMoving || isMoving || isSelecting || isSelected || isCreatingElement;

  useInertControl(containerRef, shouldInert);

  const { throttleHandleEditorContentChange } = useEditContent(contentId, nextContent => {
    if (!contentId) return;
    if (focus && isSameContent(nextContent, latestContentRef.current)) {
      return;
    }
    latestContentRef.current = nextContent;
    setInitialState(nextContent);
    onElementChange?.(board, element, { content: nextContent });
    editorRef.current?.setEditorValue(nextContent);
  });

  useEffect(() => {
    latestContentRef.current = content;
    setInitialState(content);
  }, [content]);

  // 判断是否使用简化渲染
  const useSimplifiedRender = useMemo(() => {
    const { zoom } = viewPort;
    const { simplifiedRenderZoomThreshold } = boardState;
    return zoom < simplifiedRenderZoomThreshold && !focus && !isSelected;
  }, [viewPort, boardState, focus, isSelected]);

  const simplifiedSkeletonMeta = useMemo(() => {
    if (!useSimplifiedRender) return null;

    const contentHeight = Math.max(height - paddingHeight * 2, 8);
    const lineHeight = Math.max(6, Math.min(12, Math.round(contentHeight / 22)));
    const lineGap = Math.max(4, Math.min(10, Math.round(lineHeight * 0.8)));
    const maxLinesByHeight = Math.max(
      1,
      Math.floor((contentHeight + lineGap) / (lineHeight + lineGap))
    );
    const lineCount = Math.min(maxLinesByHeight, 24);
    const lineWidths = Array.from({ length: lineCount }, (_, index) => {
      if (lineCount === 1) return 70;
      if (index === lineCount - 1) return 56;
      if (index % 4 === 3) return 82;
      if (index % 4 === 1) return 94;
      return 100;
    });

    return {
      lineHeight,
      lineGap,
      lineWidths,
    };
  }, [height, paddingHeight, useSimplifiedRender]);

  const ensureContentId = useMemoizedFn(async () => {
    if (contentId) return contentId;
    if (pendingContentIdPromiseRef.current) {
      return pendingContentIdPromiseRef.current;
    }

    const pendingPromise = (async () => {
      const currentContent = latestContentRef.current;
      const newContentId = await createContent(currentContent, getContentLength(currentContent));

      if (!newContentId) {
        throw new Error("创建内容失败");
      }

      await updateContent(newContentId, latestContentRef.current);
      onElementChange?.(board, element, {
        contentId: newContentId,
        content: latestContentRef.current,
      });
      return newContentId;
    })();

    pendingContentIdPromiseRef.current = pendingPromise;
    try {
      return await pendingPromise;
    } finally {
      pendingContentIdPromiseRef.current = null;
    }
  });

  useImperativeHandle(ref, () => ({
    setEditorValue: (value: Descendant[]) => {
      editorRef.current?.setEditorValue(value);
    },
  }));

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

  const handleFocus = useMemoizedFn(() => {
    if (readonly) return;
    setFocus(true);
    void ensureContentId().catch(error => {
      console.error("Failed to ensure content id for rich text:", error);
      message.error("初始化富文本内容失败");
    });
    board.isEditingElements = [
      ...board.isEditingElements.filter(eid => eid !== elementId),
      elementId,
    ];
  });

  const handleBlur = useMemoizedFn(() => {
    if (readonly) return;
    handleResize.flush();
    setTimeout(() => {
      setFocus(false);
      board.isEditingElements = board.isEditingElements.filter(eid => eid !== elementId);
      // 按道理 blur 的时候取消选中，但是这个时候如果想通过工具栏改变样式就没法做到了
      // 暂时不 deselect 了，后续改为右键菜单的时候在改回来
      // editorRef.current?.deselect();
    }, 100);
  });

  const handleOnContentChange = useMemoizedFn((value: Descendant[]) => {
    latestContentRef.current = value;
    onContentChange(board, element, value);
    setInitialState(value);
    if (contentId) {
      throttleHandleEditorContentChange(value);
    }
  });

  const handleOnEditorSizeChange = useMemoizedFn((width: number, height: number) => {
    onEditorSizeChange(board, element, width, height);
  });

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

  const containerStyle = useMemo(() => {
    return {
      background: "transparent",
      color: textColor,
      cursor: isSelected ? "move" : "auto",
    } as React.CSSProperties;
  }, [isSelected, textColor]);

  const handleAutoFocus = useMemoizedFn(() => {
    if (autoFocus) {
      editorRef.current?.focus();
      handleRemoveAutoFocus();
    }
  });

  useEffect(() => {
    handleAutoFocus();
  }, [handleAutoFocus]);

  const { handleResize, editorStyle } = useHandleResize({
    handleOnEditorSizeChange,
    maxWidth,
    maxHeight,
    container: containerRef.current,
    resized,
    paddingWidth,
    paddingHeight,
    focus,
    isSelected,
    autoHeight,
    width,
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
    const container = containerRef.current;

    if (!container) return;

    const editor = container.querySelector("[data-slate-editor]");
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
        width={autoHeight ? width : focus && !resized ? maxWidth : width}
        height={autoHeight ? height : focus && !resized ? maxHeight : height}
        className="border-none"
        style={{ overflow: "visible" }}
      >
        <div
          id={`rich-text-container-${elementId}`}
          className={styles.richTextContainer}
          ref={containerRef}
          style={containerStyle}
          onDoubleClick={e => {
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
              boxShadow: getShadowStyle(shadowSize, isDark),
              zIndex: -1,
            }}
          />
          {topColor && (
            <div className={styles.borderTop} style={{ background: topColor, width }}></div>
          )}
          {useSimplifiedRender && simplifiedSkeletonMeta ? (
            <div
              className={styles.simplifiedSkeleton}
              style={{
                padding: `${paddingHeight}px ${paddingWidth}px`,
                color: textColor,
                gap: `${simplifiedSkeletonMeta.lineGap}px`,
              }}
            >
              {simplifiedSkeletonMeta.lineWidths.map((lineWidth, index) => (
                <div
                  key={`${elementId}-skeleton-line-${index}`}
                  className={styles.skeletonLine}
                  style={{
                    width: `${lineWidth}%`,
                    height: `${simplifiedSkeletonMeta.lineHeight}px`,
                  }}
                />
              ))}
            </div>
          ) : (
            <ErrorBoundary>
              <Editor
                contentId={contentId}
                ref={editorRef}
                style={editorStyle}
                className={styles.editor}
                initValue={initValue}
                onChange={handleOnContentChange}
                readonly={readonly}
                onFocus={handleFocus}
                onBlur={handleBlur}
                extensions={dynamicExtensions}
                theme={theme}
              />
            </ErrorBoundary>
          )}
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
          {resizable &&
            Object.entries(resizePoints).map(([position, point]) => (
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
      <If condition={!focus}>
        <ArrowConnectPointGroup
          element={element}
          points={arrowConnectExtendPoints}
          proximityBounds={{ x, y, width, height }}
          isSelected={isSelected}
          disabled={isMoveArrowClosing}
        />
      </If>
      <If condition={isMoveArrowClosing && !focus}>
        {arrowConnectPoints.map(point => (
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

export default Richtext;
