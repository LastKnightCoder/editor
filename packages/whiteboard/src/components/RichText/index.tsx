import { nodeMessages } from "../../nodes-i18n";
import { whiteboardRuntime } from "../../i18n-runtime";
import React, { useState, useRef, useEffect, useMemo } from "react";
import { Descendant } from "slate";
import { useMemoizedFn } from "ahooks";
import { EditorRef } from "@tau/editor";
import { TextEditor as Editor } from "../../extensions/text";
import { useTextExtension } from "../../extensions/text";
import { useEditingElementCleanup } from "../../hooks/useEditingElementCleanup";
import { bindTextContent } from "../../extensions/textBinding";
import { If as If } from "@tau/ui";
import { ErrorBoundary as ErrorBoundary } from "@tau/ui";
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
import { Board, EHandlerPosition, Point } from "../../types";
import { RICHTEXT_TOOL_ID, allowsElementInteraction } from "../../constants/tools";
import { RichTextElement } from "../../plugins";
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
  useActiveTool,
  useInertControl,
  useSketch,
} from "../../hooks";
import { useBoardState } from "../../hooks/useBoardState";
import { useZoom } from "../../hooks/useZoom";
import { cn, toast, useScrollState } from "@tau/ui";

const styles = {
  richTextContainer: "relative size-full [--block-distance:10px]",
  surface: "absolute left-0 top-0 -z-10 overflow-hidden shadow-[inset_0_0_0_1px_var(--text-edge)]",
  band: "w-full",
  editor: "overscroll-contain [&::-webkit-scrollbar]:hidden",
  simplifiedSkeleton: "flex size-full flex-col justify-start overflow-hidden",
  skeletonLine: "rounded-full bg-current opacity-[0.18]",
};
import ArrowDropConnectPoint from "../ArrowDropConnectPoint";
import SketchRect from "../SketchPaths/SketchRect";
import { handTextClass } from "../../utils/sketch";
import { registerWheelScrollArea } from "../../utils/wheelGesture";

const RichTextEditor = React.memo(Editor);

type RichTextNodeType = RichTextElement;

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
  onResizeStart?: (element: RichTextNodeType, startPoint: Point) => void;
  onResizeEnd?: (
    board: Board,
    element: RichTextNodeType,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point
  ) => void;
  onResize: (
    board: Board,
    element: RichTextNodeType,
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

/** 缩略显示没有挂载编辑器，但画布缓存仍需跟随文档快照。 */
function ContentSnapshotObserver({
  contentId,
  onChange,
}: {
  contentId: number;
  onChange(value: Descendant[]): void;
}) {
  const Observer = useTextExtension().Observer;
  return Observer ? <Observer contentId={contentId} onChange={onChange} /> : null;
}

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
  const sketch = useSketch(element);
  const bandColor = getTextBandColor(textStyle);

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorRef>(null);
  const [initValue, setInitialState] = useState(content);
  const latestContentRef = useRef(content);
  const pendingContentIdPromiseRef = useRef<Promise<number | undefined> | null>(null);
  const [focus, setFocus] = useState(false);
  const board = useBoard();
  useEditingElementCleanup(elementId);
  const text = useTextExtension();
  const collaborativeDocument = board.document?.textDocument(elementId);
  const editingContext = useMemo(
    () => ({ entityType: "whiteboard", entityId: elementId }),
    [elementId]
  );
  const pendingReference = element.entity?.kind === "content" && !contentId;
  const isArrowMoving = useArrowMove();
  const activeTool = useActiveTool();
  const isMoving = useElementMoving(elementId);
  const zoom = useZoom();
  const boardState = useBoardState();

  const textMode = activeTool === RICHTEXT_TOOL_ID;
  const { isSelected: selected, isSelecting } = useSelectState(elementId);
  const isSelected = selected && !textMode;
  const shouldInert =
    isArrowMoving || isMoving || isSelecting || isSelected || !allowsElementInteraction(activeTool);
  const [focusPreview, setFocusPreview] = useState(false);
  const showConnectionPoints = !focus && !autoFocus && !focusPreview;

  useInertControl(containerRef, shouldInert);

  const syncContentSnapshot = useMemoizedFn((nextContent: Descendant[]) => {
    if (isSameContent(nextContent, latestContentRef.current)) return;
    latestContentRef.current = nextContent;
    setInitialState(nextContent);
    if (!board.document && contentId) onElementChange?.(board, element, { content: nextContent });
  });

  useEffect(() => {
    latestContentRef.current = content;
    if (!collaborativeDocument) setInitialState(content);
  }, [content, collaborativeDocument]);

  // 判断是否使用简化渲染
  const useSimplifiedRender = useMemo(() => {
    const { simplifiedRenderZoomThreshold } = boardState;
    return (
      zoom < simplifiedRenderZoomThreshold && !focus && !isSelected && !autoFocus && !focusPreview
    );
  }, [zoom, boardState, focus, isSelected, autoFocus, focusPreview]);

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
    if (board.document) return undefined;
    if (contentId) return contentId;
    if (!text.create) return undefined;
    if (pendingContentIdPromiseRef.current) {
      return pendingContentIdPromiseRef.current;
    }
    const api = board.extensions?.api;
    if (!api) return undefined;

    const pendingPromise = bindTextContent(api, element.id, text, () => latestContentRef.current);

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
    board.document?.splitHistory();
    if (readonly) return;
    setFocus(true);
    void ensureContentId().catch(error => {
      console.error("Failed to ensure content id for rich text:", error);
      const { t } = whiteboardRuntime(board).get(nodeMessages);
      toast.error(t("nodes.richtextFailed"), { getMessage: () => t("nodes.richtextFailed") });
    });
    board.isEditingElements = [
      ...board.isEditingElements.filter(eid => eid !== elementId),
      elementId,
    ];
  });

  const handleBlur = useMemoizedFn(() => {
    board.document?.splitHistory();
    board.isEditingElements = board.isEditingElements.filter(eid => eid !== elementId);
    if (readonly) return;
    handleResize.flush();
    setTimeout(() => {
      if (board.isEditingElements.includes(elementId)) return;
      setFocus(false);
      // 一个字都没打就点走：元素连同 content 一起回收。仍被选中说明用户是去点属性栏，留着
      if (
        board.captureSubmission(element)() &&
        !board.selection.selectedElements.some(node => node.id === elementId)
      )
        deleteEmptyRichText(board, element);
    }, 100);
  });

  const handleOnContentChange = useMemoizedFn((value: Descendant[]) => {
    syncContentSnapshot(value);
    if (!board.document) onContentChange(board, element, value);
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
      cursor: textMode ? "text" : isSelected ? "move" : "auto",
      width: !useSimplifiedRender && !resized && !autoHeight ? "fit-content" : undefined,
    } as React.CSSProperties;
  }, [isSelected, textMode, resized, autoHeight, useSimplifiedRender]);

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
  const { scrolled, canScrollDown } = useScrollState(editorEl);

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
    if (!editorEl || (!focus && !autoHeight)) return;

    const observer = new ResizeObserver(entries => {
      const box = entries[0]?.borderBoxSize?.[0];
      if (box) paint(box.inlineSize, box.blockSize);
    });
    observer.observe(editorEl);

    return () => {
      observer.disconnect();
      paint(storedSizeRef.current.width, storedSizeRef.current.height);
    };
  }, [editorEl, focus, autoHeight]);

  // 新建元素自动进入编辑：等编辑器真正挂上再聚焦，否则 ref 还是空的，焦点就丢了
  useEffect(() => {
    if ((!autoFocus && !focusPreview) || !editorEl) return;
    editorRef.current?.focus();
    if (autoFocus) handleRemoveAutoFocus();
    if (focusPreview) setFocusPreview(false);
  }, [autoFocus, focusPreview, editorEl, handleRemoveAutoFocus]);
  const { handleResize, editorStyle } = useHandleResize({
    handleOnEditorSizeChange,
    maxWidth,
    maxHeight,
    editor: editorEl,
    resized,
    padding,
    isEmpty: isRichTextContentEmpty(collaborativeDocument ? content : latestContentRef.current),
    isSelected,
    autoHeight,
    width,
  });

  useHandlePointer({
    container: textMode ? null : containerRef.current,
    padding,
    isSelected,
    width,
    height,
  });

  const fadeStyle = useMemo(
    () =>
      ({
        ...editorStyle,
        pointerEvents: textMode ? "auto" : undefined,
        "--gap-top": `${padding.top}px`,
        "--gap-bottom": `${padding.bottom}px`,
        "--fade-size": `${EDGE_FADE_SIZE}px`,
        "--edge-top-on": Number(scrolled),
        "--edge-bottom-on": Number(canScrollDown),
      }) as React.CSSProperties,
    [editorStyle, textMode, padding, scrolled, canScrollDown]
  );

  useEffect(() => {
    if (!editorEl) return;
    const unregister = registerWheelScrollArea(editorEl);
    const stopWheelPropagation = (event: WheelEvent) => {
      if (!event.ctrlKey) event.stopPropagation();
    };
    editorEl.addEventListener("wheel", stopWheelPropagation, { passive: true });
    return () => {
      unregister();
      editorEl.removeEventListener("wheel", stopWheelPropagation);
    };
  }, [editorEl]);

  return (
    <>
      <foreignObject
        x={x}
        y={y}
        width={!useSimplifiedRender && !autoHeight && !resized ? maxWidth : width}
        height={autoHeight ? height : focus && !resized ? maxHeight : height}
        className="border-none"
        style={{ overflow: "visible", pointerEvents: textMode && focus ? "none" : undefined }}
      >
        <div
          id={`rich-text-container-${elementId}`}
          className={cn(styles.richTextContainer, handTextClass(sketch))}
          ref={containerRef}
          style={containerStyle}
          onPointerDown={event => {
            if (!textMode || event.button !== 0 || readonly || board.readonly) return;
            event.stopPropagation();
            if (editorEl && !editorEl.contains(event.target as Node)) editorRef.current?.focus();
          }}
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
                  // 手绘时底板描边改由 SketchRect 画墨迹框
                  "--text-edge": sketch.enabled ? "transparent" : surface.edge,
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
          {useSimplifiedRender && contentId && (
            <ContentSnapshotObserver
              key={contentId}
              contentId={contentId}
              onChange={syncContentSnapshot}
            />
          )}
          {pendingReference ? (
            <div role="status" className="text-ink-3 p-3">
              关联正文尚未就绪
            </div>
          ) : useSimplifiedRender && simplifiedSkeletonMeta ? (
            <div
              className={styles.simplifiedSkeleton}
              onPointerDown={event => {
                if (textMode && event.button === 0 && !readonly && !board.readonly) {
                  event.stopPropagation();
                  setFocusPreview(true);
                }
              }}
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
              <RichTextEditor
                document={collaborativeDocument}
                contentId={contentId}
                ref={editorRef}
                style={fadeStyle}
                className={cn(styles.editor, (scrolled || canScrollDown) && "tau-board-text-mask")}
                initValue={collaborativeDocument ? undefined : initValue}
                onChange={handleOnContentChange}
                readonly={readonly}
                editingContext={editingContext}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </ErrorBoundary>
          )}
        </div>
      </foreignObject>
      {surface && sketch.enabled && (
        <SketchRect
          x={x}
          y={y}
          width={width}
          height={height}
          radius={TEXT_BOX.radius}
          stroke={surface.sketchEdge}
          strokeWidth={1.2}
          level={sketch.level}
          seed={sketch.seed}
        />
      )}
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
      <If condition={showConnectionPoints}>
        <ArrowConnectPointGroup
          element={element}
          points={arrowConnectExtendPoints}
          isSelected={isSelected}
          disabled={isMoveArrowClosing}
        />
      </If>
      <If condition={isMoveArrowClosing && showConnectionPoints}>
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
