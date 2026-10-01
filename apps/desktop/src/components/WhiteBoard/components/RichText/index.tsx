import React, { useState, useRef, useEffect, useMemo } from "react";
import { Descendant } from "slate";
import { useMemoizedFn } from "ahooks";
import { EditorRef } from "@tau/editor";
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
import { PointUtil, deleteEmptyRichText, isRichTextContentEmpty } from "../../utils";
import {
  TEXT_BOX,
  TEXT_COLORS,
  getTextBandColor,
  getTextBoxPadding,
  getTextSurface,
  resolveTextStyle,
  toCssPadding,
} from "../../constants";
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
import { toast, useEdgeFade } from "@tau/ui";

import "./mask.css";

const styles = {
  richTextContainer: "relative size-full [--block-distance:10px]",
  surface: "absolute left-0 top-0 -z-10 overflow-hidden shadow-[inset_0_0_0_1px_var(--text-edge)]",
  band: "w-full",
  editor: "tau-board-text-mask [&::-webkit-scrollbar]:hidden",
  simplifiedSkeleton: "flex size-full flex-col justify-start overflow-hidden",
  skeletonLine: "rounded-full bg-current opacity-[0.18]",
};
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

/** 留白内沿的渐隐带高度 */
const EDGE_FADE_SIZE = 16;
const isSameContent = (a: Descendant[], b: Descendant[]) => JSON.stringify(a) === JSON.stringify(b);

const Richtext = (props: RichTextProps) => {
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
    resizable = true,
    autoHeight = false,
  } = element;
  const { variant, tone } = resolveTextStyle(element);
  const textStyle = useMemo(() => ({ variant, tone }), [variant, tone]);
  const padding = useMemo(() => getTextBoxPadding(textStyle), [textStyle]);
  const surface = getTextSurface(textStyle);
  const bandColor = getTextBandColor(textStyle);

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

    const contentHeight = Math.max(height - padding.top - padding.bottom, 8);
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
  }, [height, padding, useSimplifiedRender]);

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
      toast.error("初始化富文本内容失败");
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
      // 一个字都没打就点走：元素连同 content 一起回收。仍被选中说明用户是去点属性栏，留着
      if (!isSelected && deleteEmptyRichText(board, element)) return;
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
      color: TEXT_COLORS.ink,
      cursor: isSelected ? "move" : "auto",
    } as React.CSSProperties;
  }, [isSelected]);

  // 编辑器 DOM 的挂载时机不确定：contentId 对应的协作会话就绪前 ContentEditor 只渲染占位，
  // 简化渲染切回时又会重建。用 MutationObserver 跟住它，聚焦与渐隐都挂在这个时机上
  const [editorEl, setEditorEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const sync = () =>
      setEditorEl(prev => {
        const next = container.querySelector<HTMLElement>("[data-slate-editor]") ?? null;
        return next === prev ? prev : next;
      });

    sync();
    const observer = typeof MutationObserver === "undefined" ? null : new MutationObserver(sync);
    observer?.observe(container, { childList: true, subtree: true });
    return () => observer?.disconnect();
  }, []);
  useEdgeFade(editorEl);

  // 底板实时跟住编辑器盒子：写回元素尺寸带防抖，打字时底板会慢半拍。
  // 这里直接改 DOM，不走 state，避免每帧重渲染；编辑器卸载时还原成元素上存的尺寸
  const surfaceRef = useRef<HTMLDivElement>(null);
  const storedSizeRef = useRef({ width, height });
  storedSizeRef.current = { width, height };
  useEffect(() => {
    const paint = (w: number, h: number) => {
      const surface = surfaceRef.current;
      if (!surface) return;
      surface.style.width = `${w}px`;
      surface.style.height = `${h}px`;
    };
    if (!editorEl) return;

    const observer = new ResizeObserver(entries => {
      const box = entries[0]?.borderBoxSize?.[0];
      if (box) paint(box.inlineSize, box.blockSize);
    });
    observer.observe(editorEl);

    return () => {
      observer.disconnect();
      paint(storedSizeRef.current.width, storedSizeRef.current.height);
    };
  }, [editorEl]);

  // 新建元素自动进入编辑：等编辑器真正挂上再聚焦，否则 ref 还是空的，焦点就丢了
  useEffect(() => {
    if (!autoFocus || !editorEl) return;
    editorRef.current?.focus();
    handleRemoveAutoFocus();
  }, [autoFocus, editorEl, handleRemoveAutoFocus]);
  const { handleResize, editorStyle } = useHandleResize({
    handleOnEditorSizeChange,
    maxWidth,
    maxHeight,
    editor: editorEl,
    resized,
    padding,
    isEmpty: isRichTextContentEmpty(latestContentRef.current),
    focus,
    isSelected,
    autoHeight,
    width,
  });

  useHandlePointer({
    container: containerRef.current,
    padding,
    isSelected,
    width,
    height,
  });

  const fadeStyle = useMemo(
    () =>
      ({
        ...editorStyle,
        "--gap-top": `${padding.top}px`,
        "--gap-bottom": `${padding.bottom}px`,
        "--fade-size": `${EDGE_FADE_SIZE}px`,
      }) as React.CSSProperties,
    [editorStyle, padding]
  );

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
          {surface && (
            <div
              ref={surfaceRef}
              className={styles.surface}
              style={
                {
                  width,
                  height,
                  borderRadius: TEXT_BOX.radius,
                  background: surface.background,
                  "--text-edge": surface.edge,
                } as React.CSSProperties
              }
            >
              {bandColor && (
                <div
                  className={styles.band}
                  style={{ height: TEXT_BOX.bandHeight, background: bandColor }}
                />
              )}
            </div>
          )}
          {useSimplifiedRender && simplifiedSkeletonMeta ? (
            <div
              className={styles.simplifiedSkeleton}
              style={{
                padding: toCssPadding(padding),
                color: TEXT_COLORS.ink,
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
                style={fadeStyle}
                className={styles.editor}
                initValue={initValue}
                onChange={handleOnContentChange}
                readonly={readonly}
                editingContext={{ entityType: "whiteboard", entityId: elementId }}
                onFocus={handleFocus}
                onBlur={handleBlur}
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
            rx={TEXT_BOX.radius}
            ry={TEXT_BOX.radius}
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
};

export default Richtext;
