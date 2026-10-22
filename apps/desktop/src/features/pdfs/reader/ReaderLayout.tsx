/**
 * 阅读器主体（EmbedPDF 上下文内）：左面板 + 阅读区（引擎视口 + 每页叠加层 + 查找条 + 底部 HUD）。
 * 交互编排集中在这里：先划线再出工具条（没有「工具模式」）、点标注出同一条工具条、Alt 拖动框选、
 * 空格按住平移、页边批注（展开）/ 页内图钉（收起）、书签、查找、引用跳转闪烁。
 * 页边只在单页、未旋转时展开：包住 Scroller 的容器右侧留出页边宽度，适宽 / 适页经 useMarginFit 把页边算进去。
 *
 * 阅读位置：持续记录视口顶端所在页与页内位置（onPositionChange）；首次就绪、以及页面保活后重新显示时
 * （隐藏期间 display:none 会丢掉滚动位置）都按记下的位置还原，还原后短时间内的缩放适配也跟着重新对齐。
 *
 * 键位：←/→ 翻页、B 书签、D 双页、R 旋转、M 页边、H 抓手、空格平移、Alt 框选；Ctrl/⌘+F 经全局查找接管打开查找条；
 * 只在焦点位于阅读器（或无焦点）时生效，让位编辑上下文与输入法组合。Alt+←/→ 归导航，
 * 这里只把单独按下的 Alt 当作框选修饰键。Esc 一律经页面浮层仲裁。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMemoizedFn } from "ahooks";
import { v4 as uuid } from "uuid";
import type {
  Rotation,
  PdfAnnotationObject,
  PdfDocumentObject,
  PdfEngine,
  SearchResult,
} from "@embedpdf/models";
import { useLoaderCapability } from "@embedpdf/plugin-loader/react";
import { Viewport, useViewportCapability } from "@embedpdf/plugin-viewport/react";
import { Scroller, useScroll } from "@embedpdf/plugin-scroll/react";
import { RenderLayer } from "@embedpdf/plugin-render/react";
import { TilingLayer } from "@embedpdf/plugin-tiling/react";
import {
  GlobalPointerProvider,
  PagePointerProvider,
} from "@embedpdf/plugin-interaction-manager/react";
import { SelectionLayer, useSelectionCapability } from "@embedpdf/plugin-selection/react";
import { AnnotationLayer, useAnnotationCapability } from "@embedpdf/plugin-annotation/react";
import { useZoom } from "@embedpdf/plugin-zoom/react";
import { ZoomMode } from "@embedpdf/plugin-zoom";
import { usePanCapability } from "@embedpdf/plugin-pan/react";
import { MarqueeCapture, useCaptureCapability } from "@embedpdf/plugin-capture/react";
import { Rotate, useRotate } from "@embedpdf/plugin-rotate/react";
import { useSpread } from "@embedpdf/plugin-spread/react";
import { SpreadMode } from "@embedpdf/plugin-spread";
import { FADE_SCROLL_CLASS, Loading, cn, toast, useEdgeFade } from "@tau/ui";
import { searchPdfContent, showInFolder } from "@/commands";
import { useFindOwner } from "@/components/GlobalFindBar/findOwner";
import { uploadResource } from "@/hooks/useUploadResource";
import { useOverlayDismiss } from "@/page/PageProvider";
import { isEditableTarget } from "@tau/ui";
import type { EHighlightColor, Pdf, PdfAnnotation, PdfSearchResult } from "@/types";
import type { PdfCitationTarget } from "@/utils/pdfCitation";
import {
  annotationPage,
  annotationRect,
  annotationText,
  hasNote,
  isEngineAnnotation,
  joinSelectedLines,
  isMarginNote,
  markupDefaults,
  noteText,
  notesPlainText,
  MARGIN_RATIO,
  markupStyleOf,
  toggleStylePatch,
  COLOR_SPECS,
  type PdfQuote,
} from "./annotationModel";
import { bookmarkPage, useReaderAnnotations, useReaderBookmarks, type usePdfIndex } from "./data";
import { activeOutlineKey, flattenOutline } from "./outline";
import {
  OVERLAY_ATTR,
  ReaderContext,
  type NoteTarget,
  type PageHighlight,
  type ReaderContextValue,
  type ReaderOverlay,
} from "./readerContext";
import { useReaderPrefs } from "./readerPrefs";
import { convertMaterialToCard } from "@/services/material-to-card";
import { useAnnotationSync } from "./useAnnotationSync";
import { useMarginFit } from "./useMarginFit";
import type { ReadingPosition } from "./readingPosition";
import { nightPaper, paperPalette, samplePaperColor, type Rgb } from "./paper";
import { usePinchZoom } from "./usePinchZoom";
import { AnnotationMenu, type SelectionMenuProps } from "./components/AnnotationMenu";
import { FindBar, type FindMode, type FindResultRow } from "./components/FindBar";
import { Hud } from "./components/Hud";
import { LeftPanel } from "./components/LeftPanel";
import { PageLayer } from "./components/PageLayer";

export interface ReaderLayoutProps {
  pdf: Pdf;
  engine: PdfEngine;
  pluginsReady: boolean;
  resolvedPath: string | null;
  mainDbName: string;
  index: ReturnType<typeof usePdfIndex>;
  jumpTarget?: PdfCitationTarget | null;
  /** 定位到某条标注（材料打开到原处）；标注加载、布局就绪后跳一次 */
  jumpAnnotationId?: number | null;
  /** 打开时还原到的阅读位置（只在挂载时读取） */
  initialPosition?: ReadingPosition | null;
  onPositionChange?: (position: ReadingPosition) => void;
  /** 不传则隐藏所有「问 AI」入口 */
  onAskAI?: (quote: PdfQuote) => void;
  /** 宿主没有面包屑开关时，左面板开关放进 HUD */
  leftToggleInHud?: boolean;
  /** 对话关着时 HUD 末尾给出开关 */
  onOpenChat?: () => void;
}

const FLASH_MS = 2200;
/** 还原阅读位置后，这段时间内的滚动不记、缩放变化跟着重新对齐 */
const RESTORE_SETTLE_MS = 600;
const KEYWORD_DEBOUNCE_MS = 250;

const isRecord = (target: PdfAnnotationObject | PdfAnnotation): target is PdfAnnotation =>
  "pdfId" in target;

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

/** 引擎任务转 Promise（任务的进度类型各异，这里只关心结果） */
function waitTask<T>(task: {
  wait: (ok: (value: T) => void, fail: (error: unknown) => void) => void;
}) {
  return new Promise<T>((resolve, reject) => task.wait(resolve, reject));
}

type SearchTask = ReturnType<PdfEngine["searchAllPages"]>;

async function uploadBlob(blob: Blob, name: string): Promise<string> {
  const url = await uploadResource(new File([blob], name, { type: blob.type || "image/png" }));
  if (!url) throw new Error("上传未返回地址");
  return url;
}

async function copyImage(blob: Blob) {
  const png =
    blob.type === "image/png" ? blob : new Blob([await blob.arrayBuffer()], { type: "image/png" });
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

export function ReaderLayout({
  pdf,
  engine,
  pluginsReady,
  resolvedPath,
  mainDbName,
  index,
  jumpTarget,
  jumpAnnotationId,
  initialPosition,
  onPositionChange,
  onAskAI,
  leftToggleInHud,
  onOpenChat,
}: ReaderLayoutProps) {
  const prefs = useReaderPrefs();
  const annotations = useReaderAnnotations(pdf.id);
  const bookmarkStore = useReaderBookmarks(pdf.id);
  const sync = useAnnotationSync(pluginsReady, annotations);
  const records = useMemo(() => annotations.records ?? [], [annotations.records]);
  const bookmarks = useMemo(() => bookmarkStore.bookmarks ?? [], [bookmarkStore.bookmarks]);

  const { provides: loader } = useLoaderCapability();
  const { provides: scroll, state: scrollState } = useScroll();
  const { provides: zoom, state: zoomState } = useZoom();
  const { provides: selection } = useSelectionCapability();
  const { provides: annotationCap } = useAnnotationCapability();
  const { provides: capture } = useCaptureCapability();
  const { provides: pan } = usePanCapability();
  const { provides: rotate, rotation } = useRotate();
  const { spreadMode, provides: spread } = useSpread();

  const rootRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const currentPage = scrollState?.currentPage ?? 1;
  const totalPages = scrollState?.totalPages || pdf.pageCount || 1;
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;
  const layoutReady = pluginsReady && (scrollState?.totalPages ?? 0) > 0;

  /* ───────── 文档与目录 ───────── */

  const [doc, setDoc] = useState<PdfDocumentObject | null>(null);
  useEffect(() => {
    if (!loader) return;
    const current = loader.getDocument();
    if (current) setDoc(current);
    return loader.onDocumentLoaded(loaded => setDoc(loaded));
  }, [loader]);

  const outlineQuery = useQuery({
    queryKey: ["pdfs", "outline", pdf.id, pdf.updateTime],
    queryFn: async () => (doc ? ((await waitTask(engine.getBookmarks(doc))).bookmarks ?? []) : []),
    enabled: Boolean(doc),
    staleTime: Infinity,
    gcTime: 0,
  });
  const outline = useMemo(() => flattenOutline(outlineQuery.data ?? []), [outlineQuery.data]);

  /* ───────── 阅读位置 ───────── */

  const positionRef = useRef<ReadingPosition | null>(initialPosition ?? null);
  const onPositionChangeRef = useRef(onPositionChange);
  onPositionChangeRef.current = onPositionChange;
  // 这一时刻之前的滚动是还原 / 适配引起的，不当作阅读位置；有起始位置时首次还原前（引擎先报第 1 页）一律不记
  const restoringUntil = useRef(initialPosition ? Infinity : 0);
  const { provides: viewportCap } = useViewportCapability();

  const restorePosition = useMemoizedFn(() => {
    const position = positionRef.current;
    if (!position || !scroll) return;
    scroll.scrollToPage({
      pageNumber: position.page,
      pageCoordinates: { x: 0, y: position.y },
      behavior: "instant",
    });
  });

  useEffect(() => {
    if (!scroll || !viewportCap) return;
    return scroll.onScroll(metrics => {
      if (performance.now() < restoringUntil.current) return;
      if (viewportCap.getMetrics().clientHeight === 0) return;
      const top = metrics.pageVisibilityMetrics[0];
      if (!top) return;
      // 引擎的页内位置没扣视口留白（scrollToPage 会加上），这里扣掉，往返不漂移
      const scale = zoom?.getState().currentZoomLevel ?? 1;
      const y =
        top.original.pageY > 0 ? top.original.pageY - viewportCap.getViewportGap() / scale : 0;
      const position = { page: top.pageNumber, y: Math.max(0, Math.round(y)) };
      positionRef.current = position;
      onPositionChangeRef.current?.(position);
    });
  }, [scroll, viewportCap, zoom]);

  // 保活页重新显示时 effect 会重跑：布局就绪即还原，下一帧（视口重新量过尺寸）再对齐一次
  useEffect(() => {
    if (!layoutReady) return;
    restoringUntil.current = performance.now() + RESTORE_SETTLE_MS;
    restorePosition();
    const frame = requestAnimationFrame(restorePosition);
    return () => cancelAnimationFrame(frame);
  }, [layoutReady, restorePosition]);

  // 还原后不久的适宽 / 页边适配会改缩放，跟着再对齐
  const currentZoom = zoomState?.currentZoomLevel;
  useEffect(() => {
    if (currentZoom && performance.now() < restoringUntil.current) restorePosition();
  }, [currentZoom, restorePosition]);

  /* ───────── 页边 ───────── */

  const marginActive = prefs.marginOpen && spreadMode === SpreadMode.None && rotation === 0;
  useMarginFit(marginActive ? MARGIN_RATIO : null);
  const contentWidth = scroll?.getLayout().totalContentSize.width ?? 0;
  const marginWidth = marginActive
    ? Math.round(MARGIN_RATIO * contentWidth * (zoomState?.currentZoomLevel ?? 1))
    : 0;

  /* ───────── 浮层状态 ───────── */

  const [overlay, setOverlay] = useState<ReaderOverlay | null>(null);
  const [noteTarget, setNoteTarget] = useState<NoteTarget | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const [flashPin, setFlashPin] = useState<number | null>(null);
  const [flash, setFlash] = useState<PageHighlight | null>(null);
  const [activeRecordId, setActiveRecordId] = useState<number | null>(null);
  // 页边收起时页边草稿没有承载处，直接丢弃
  useEffect(() => {
    if (!marginActive) setNoteTarget(current => (current?.objectId === null ? null : current));
  }, [marginActive]);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  useEffect(() => () => timers.current.forEach(t => window.clearTimeout(t)), []);

  const dismissOverlay = useMemoizedFn(() => {
    if (overlay?.kind === "selection") selection?.clear();
    setOverlay(null);
  });
  useOverlayDismiss(dismissOverlay, overlay !== null);
  useOverlayDismiss(() => setPinned(null), pinned !== null);

  // 划完线：没有激活的引擎工具时，在选区第一页上方弹工具条
  useEffect(() => {
    if (!selection) return;
    const offEnd = selection.onEndSelection(() => {
      if (annotationCap?.getActiveTool()) return;
      const formatted = selection.getFormattedSelection();
      const first = formatted[0];
      if (!first) return;
      selection.getSelectedText().wait(
        lines => {
          const text = joinSelectedLines(lines);
          if (!text) return;
          annotationCap?.deselectAnnotation();
          setOverlay({ kind: "selection", pageIndex: first.pageIndex, rect: first.rect, text });
        },
        () => undefined
      );
    });
    const offChange = selection.onSelectionChange(range => {
      if (!range) setOverlay(current => (current?.kind === "selection" ? null : current));
    });
    return () => {
      offEnd();
      offChange();
    };
  }, [selection, annotationCap]);

  // 引擎的选区只是画在位图上的高亮，页面里没有 DOM 选区，⌘C / 菜单「复制」要在 copy 事件里自己写剪贴板；
  // 页面别处有真实选区或焦点在输入框时让位
  const selectionCopyText = overlay?.kind === "selection" ? overlay.text : null;
  useEffect(() => {
    if (!selectionCopyText) return;
    const onCopy = (e: ClipboardEvent) => {
      if (isEditableTarget(document.activeElement) || window.getSelection()?.toString()) return;
      e.preventDefault();
      e.clipboardData?.setData("text/plain", selectionCopyText);
    };
    document.addEventListener("copy", onCopy);
    return () => document.removeEventListener("copy", onCopy);
  }, [selectionCopyText]);

  // Alt 拖动框选：松开即截图，弹区域工具条
  useEffect(() => {
    if (!capture) return;
    return capture.onCaptureArea(event => {
      capture.disableMarqueeCapture();
      setOverlay({
        kind: "area-new",
        pageIndex: event.pageIndex,
        rect: event.rect,
        blob: event.blob,
      });
    });
  }, [capture]);

  /* ───────── 跳转 ───────── */

  const scrollToRect = useCallback(
    (pageNumber: number, point?: { x: number; y: number }) => {
      scroll?.scrollToPage({
        pageNumber,
        ...(point ? { pageCoordinates: point, center: true } : {}),
        behavior: "smooth",
      });
    },
    [scroll]
  );

  /** 引用 / 语义结果跳转：翻到该页，再按摘录在页内找原文并闪一下 */
  const navigateToTarget = useMemoizedFn(async (target: PdfCitationTarget) => {
    const pageIndex = target.pageNumber - 1;
    scroll?.scrollToPage({
      pageNumber: target.pageNumber,
      behavior: target.previewText ? "smooth" : "instant",
    });
    const preview = normalize(target.previewText ?? "");
    if (!doc || preview.length < 4) return;
    for (const length of [48, 24, 12]) {
      const snippet = preview.slice(0, length).trim();
      if (snippet.length < 4) continue;
      try {
        const result = await waitTask(engine.searchAllPages(doc, snippet));
        const hit = result.results.find(r => r.pageIndex === pageIndex) ?? null;
        if (!hit || hit.rects.length === 0) continue;
        setFlash({ pageIndex, rects: hit.rects });
        scrollToRect(target.pageNumber, hit.rects[0].origin);
        later(() => setFlash(current => (current?.rects === hit.rects ? null : current)), FLASH_MS);
        return;
      } catch {
        return;
      }
    }
  });

  // 每个跳转目标只跳一次：保活页重新显示时 effect 重跑，不能再跳回旧目标
  const handledJump = useRef<PdfCitationTarget | null>(null);
  useEffect(() => {
    if (!jumpTarget || !layoutReady || handledJump.current === jumpTarget) return;
    handledJump.current = jumpTarget;
    void navigateToTarget(jumpTarget);
  }, [jumpTarget, layoutReady, navigateToTarget]);

  const jumpToRecord = useMemoizedFn((record: PdfAnnotation) => {
    const rect = annotationRect(record);
    scrollToRect(annotationPage(record), rect ? { x: rect.x, y: rect.y } : undefined);
    setActiveRecordId(record.id);
    if (hasNote(record) || isMarginNote(record)) {
      setPinned(record.id);
      setFlashPin(record.id);
      later(() => setFlashPin(current => (current === record.id ? null : current)), 1800);
    } else if (record.type === "area") {
      setOverlay({ kind: "area", recordId: record.id });
    } else {
      annotationCap?.selectAnnotation(annotationPage(record) - 1, record.annotation.id);
    }
  });

  const pendingAnnotation = useRef<number | null>(null);
  useEffect(() => {
    pendingAnnotation.current = jumpAnnotationId ?? null;
  }, [jumpAnnotationId]);
  useEffect(() => {
    const id = pendingAnnotation.current;
    if (id == null || !layoutReady) return;
    const record = records.find(r => r.id === id);
    if (!record) return;
    pendingAnnotation.current = null;
    jumpToRecord(record);
  }, [jumpAnnotationId, layoutReady, records, jumpToRecord]);

  /* ───────── 书签 ───────── */

  const bookmarkedPages = useMemo(
    () => new Set(bookmarks.map(bookmarkPage).filter((p): p is number => p != null)),
    [bookmarks]
  );
  const toggleBookmark = useMemoizedFn((pageNumber: number) => {
    const existing = bookmarks.find(b => bookmarkPage(b) === pageNumber);
    if (existing) {
      void bookmarkStore.remove(existing);
      return;
    }
    const sectionKey = activeOutlineKey(outline, pageNumber);
    const section = outline.find(row => row.key === sectionKey)?.title;
    void bookmarkStore.add(pageNumber, section ?? `第 ${pageNumber} 页`);
  });

  /* ───────── 标注动作 ───────── */

  const recordOf = (object: PdfAnnotationObject) =>
    records.find(r => r.annotation.id === object.id) ?? null;

  const createMarkup = useMemoizedFn((color: EHighlightColor): NoteTarget | null => {
    if (!selection || !annotationCap || overlay?.kind !== "selection") return null;
    const formatted = selection.getFormattedSelection();
    let first: NoteTarget | null = null;
    for (const item of formatted) {
      const id = uuid();
      annotationCap.createAnnotation(item.pageIndex, {
        ...markupDefaults(prefs.lastStyle, color),
        id,
        pageIndex: item.pageIndex,
        rect: item.rect,
        segmentRects: item.segmentRects,
        created: new Date(),
        custom: { text: overlay.text },
      } as PdfAnnotationObject);
      first ??= { objectId: id, pageIndex: item.pageIndex, rect: item.rect };
    }
    prefs.setLastColor(color);
    selection.clear();
    setOverlay(null);
    return first;
  });

  const quoteOf = (target: PdfAnnotationObject | PdfAnnotation): PdfQuote => {
    if (isRecord(target)) {
      if (isMarginNote(target)) {
        return { kind: "margin", pageNumber: annotationPage(target), text: noteText(target) };
      }
      return target.type === "area"
        ? {
            kind: "area",
            pageNumber: annotationPage(target),
            text: "",
            imageUrl: target.areaData?.captureUrl,
          }
        : {
            kind: "annotation",
            pageNumber: annotationPage(target),
            text: annotationText(target.annotation),
          };
    }
    return {
      kind: "annotation",
      pageNumber: (target.pageIndex ?? 0) + 1,
      text: annotationText(target),
    };
  };

  const askWith = useMemoizedFn((quote: PdfQuote) => {
    onAskAI?.(quote);
    annotationCap?.deselectAnnotation();
    setOverlay(null);
  });

  const copyText = async (text: string, label = "原文") => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`已复制${label}`);
    } catch {
      toast.error("复制失败");
    }
  };

  const removeTarget = useMemoizedFn((target: PdfAnnotationObject | PdfAnnotation) => {
    const record = isRecord(target) ? target : recordOf(target);
    if (record && !isEngineAnnotation(record)) {
      void annotations.remove(record);
    } else {
      // 文本标注从引擎删，落库由同步钩子跟进
      const object = isRecord(target) ? target.annotation : target;
      annotationCap?.deleteAnnotation(object.pageIndex ?? 0, object.id);
    }
    setOverlay(null);
    if (pinned === record?.id) setPinned(null);
    if (!record) return;
    toast.info(isMarginNote(record) ? "已删除页边批注" : "已删除标注", {
      duration: 5000,
      action: {
        label: "撤销",
        onClick: () => {
          void annotations.restore(record).then(restored => {
            if (isEngineAnnotation(restored)) sync.reimport(restored);
          });
        },
      },
    });
  });

  const openNote = useMemoizedFn((target: PdfAnnotationObject | PdfAnnotation) => {
    const areaRect = isRecord(target) && target.type === "area" ? annotationRect(target) : null;
    if (isRecord(target) && areaRect) {
      const rect = areaRect;
      setNoteTarget({
        objectId: target.annotation.id,
        pageIndex: annotationPage(target) - 1,
        rect: {
          origin: { x: rect.x, y: rect.y },
          size: { width: rect.width, height: rect.height },
        },
      });
    } else {
      const object = isRecord(target) ? target.annotation : target;
      setNoteTarget({ objectId: object.id, pageIndex: object.pageIndex ?? 0, rect: object.rect });
    }
    annotationCap?.deselectAnnotation();
    setOverlay(null);
    setPinned(null);
  });

  /* ───────── 查找 ───────── */

  const find = useFind({
    pdf,
    engine,
    doc,
    mainDbName,
    index,
    onNavigate: navigateToTarget,
    scroll,
  });

  // 阅读器随滚动逐帧重渲染（引擎滚动状态），上下文不做 memo：每页叠加层本来就跟着重绘
  const selectionText = overlay?.kind === "selection" ? overlay.text : "";
  const newArea = overlay?.kind === "area-new" ? overlay : null;
  const readerValue: ReaderContextValue = {
    records,
    bookmarkedPages,
    overlay,
    noteTarget,
    pinned,
    flashPin,
    searchHits: find.hits,
    currentHit: find.currentHit,
    flash,
    canAsk: Boolean(onAskAI),
    newStyle: prefs.lastStyle,
    marginWidth,
    toggleBookmark,
    setPinned,
    selectArea: recordId => setOverlay(recordId == null ? null : { kind: "area", recordId }),
    dismissOverlay,

    markSelection: color => void createMarkup(color),
    toggleNewStyle: () =>
      prefs.setLastStyle(prefs.lastStyle === "highlight" ? "underline" : "highlight"),
    noteSelection: () => {
      const target = createMarkup(prefs.lastColor);
      if (target) setNoteTarget(target);
    },
    askSelection: () => {
      if (overlay?.kind !== "selection") return;
      askWith({ kind: "selection", pageNumber: overlay.pageIndex + 1, text: selectionText });
      selection?.clear();
    },
    copySelection: () => {
      void copyText(selectionText);
      selection?.clear();
      setOverlay(null);
    },

    saveNewArea: () => {
      if (!newArea) return;
      setOverlay(null);
      void (async () => {
        try {
          const captureUrl = await uploadBlob(newArea.blob, `pdf-capture-${Date.now()}.png`);
          const { origin, size } = newArea.rect;
          await annotations.createArea(
            {
              rect: { x: origin.x, y: origin.y, width: size.width, height: size.height },
              captureUrl,
              pageIndex: newArea.pageIndex,
            },
            prefs.lastColor
          );
        } catch (error) {
          console.error("[pdf-reader] 保存区域标注失败", error);
          toast.error("区域截图上传失败，请检查设置里的上传目标");
        }
      })();
    },
    askNewArea: () => {
      if (!newArea) return;
      setOverlay(null);
      void (async () => {
        try {
          const imageUrl = await uploadBlob(newArea.blob, `pdf-capture-${Date.now()}.png`);
          askWith({ kind: "area", pageNumber: newArea.pageIndex + 1, text: "", imageUrl });
        } catch (error) {
          console.error("[pdf-reader] 截图上传失败", error);
          toast.error("区域截图上传失败，请检查设置里的上传目标");
        }
      })();
    },
    copyNewArea: () => {
      if (!newArea) return;
      setOverlay(null);
      void copyImage(newArea.blob)
        .then(() => toast.success("已复制图片"))
        .catch(() => toast.error("复制图片失败"));
    },

    recolor: (target, color) => {
      prefs.setLastColor(color);
      if (isRecord(target)) {
        void annotations.setAreaColor(target, color);
        return;
      }
      annotationCap?.updateAnnotation(target.pageIndex ?? 0, target.id, {
        color: COLOR_SPECS[color].pdfHex,
      } as Partial<PdfAnnotationObject>);
    },
    toggleStyle: object => {
      const style = markupStyleOf(object);
      if (!style) return;
      annotationCap?.updateAnnotation(object.pageIndex ?? 0, object.id, toggleStylePatch(style));
    },
    openNote,
    ask: target => askWith(quoteOf(target)),
    copy: target => {
      if (isRecord(target) && target.type === "area") {
        const url = target.areaData?.captureUrl;
        if (!url) return;
        void fetch(url)
          .then(res => res.blob())
          .then(copyImage)
          .then(() => toast.success("已复制图片"))
          .catch(() => toast.error("复制图片失败"));
        return;
      }
      const quote = quoteOf(target);
      void copyText(quote.text, quote.kind === "margin" ? "批注" : "原文");
    },
    remove: removeTarget,
    clearNote: record => {
      // 页边批注只有笔记，清空即删除整条
      if (isMarginNote(record)) {
        removeTarget(record);
        return;
      }
      const previous = record.notes;
      setPinned(null);
      void annotations.updateNotes(record.id, []).then(() =>
        toast.info("已删除笔记", {
          duration: 5000,
          action: {
            label: "撤销",
            onClick: () => void annotations.updateNotes(record.id, previous),
          },
        })
      );
    },
    draftMargin: (pageIndex, y) => {
      annotationCap?.deselectAnnotation();
      setOverlay(null);
      setPinned(null);
      setNoteTarget({
        objectId: null,
        pageIndex,
        rect: { origin: { x: 0, y }, size: { width: 0, height: 0 } },
      });
    },
    saveMarginDraft: async notes => {
      const target = noteTarget;
      if (target?.objectId !== null || !target) return;
      if (!notesPlainText(notes)) {
        setNoteTarget(null);
        return;
      }
      try {
        await annotations.createMargin(target.pageIndex, target.rect.origin.y, notes);
        setNoteTarget(null);
      } catch (error) {
        console.error("[pdf-reader] 保存页边批注失败", error);
        toast.error("保存页边批注失败");
      }
    },

    closeNote: () => setNoteTarget(null),
    saveNote: async (record, notes) => {
      if (isMarginNote(record) && !notesPlainText(notes)) {
        setNoteTarget(null);
        removeTarget(record);
        return;
      }
      await annotations.updateNotes(record.id, notes);
      setNoteTarget(null);
    },
  };

  /* ───────── 视图操作 ───────── */

  const zoomLabel = (() => {
    const level = zoomState?.zoomLevel;
    if (level === ZoomMode.FitWidth) return "适宽";
    if (level === ZoomMode.FitPage) return "适页";
    return `${Math.round((zoomState?.currentZoomLevel ?? 1) * 100)}%`;
  })();
  const cycleZoom = () => {
    const level = zoomState?.zoomLevel;
    zoom?.requestZoom(
      level === ZoomMode.FitWidth
        ? ZoomMode.FitPage
        : level === ZoomMode.FitPage
          ? 1
          : ZoomMode.FitWidth
    );
  };
  const toggleSpread = useMemoizedFn(() =>
    spread?.setSpreadMode(spreadMode === SpreadMode.None ? SpreadMode.Odd : SpreadMode.None)
  );
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void rootRef.current?.requestFullscreen?.();
  };

  // 触摸屏双指 / 触控板捏合（Chromium 里是带 Ctrl 的 wheel）缩放
  const zoomAt = useCallback(
    (delta: number, clientX: number, clientY: number) => {
      const panel = viewerRef.current;
      if (!zoom || !panel) return;
      const rect = panel.getBoundingClientRect();
      zoom.requestZoomBy(delta, { vx: clientX - rect.left, vy: clientY - rect.top });
    },
    [zoom]
  );
  usePinchZoom({ onZoom: zoomAt, containerRef: viewerRef, enabled: pluginsReady });
  useEffect(() => {
    const panel = viewerRef.current;
    if (!panel || !pluginsReady) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomAt(-e.deltaY * 0.01, e.clientX, e.clientY);
    };
    panel.addEventListener("wheel", onWheel, { passive: false });
    return () => panel.removeEventListener("wheel", onWheel);
  }, [pluginsReady, zoomAt]);

  /* ───────── 键位 ───────── */

  // 视口是引擎组件（ref 被它自己占用），挂载后按标记属性取元素，接边缘渐隐
  const [viewportEl, setViewportEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setViewportEl(
      pluginsReady
        ? (viewerRef.current?.querySelector<HTMLElement>("[data-pdf-viewport]") ?? null)
        : null
    );
  }, [pluginsReady]);
  useEdgeFade(viewportEl);

  // 抓手：HUD 按钮 / H 常开；按住空格临时打开，松开回到当前工具
  const [handTool, setHandTool] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const panning = handTool || spaceHeld;
  useEffect(() => {
    if (!pan) return;
    if (panning) {
      selection?.clear();
      pan.enablePan();
    } else {
      pan.disablePan();
    }
  }, [pan, panning, selection]);

  // Ctrl/⌘+F 由全局查找条统一接收，阅读器在场时经查找接管转给阅读器自己的查找条
  useFindOwner(find.open);
  useEffect(() => {
    const withinReader = (target: EventTarget | null) =>
      target === document.body ||
      (target instanceof Node && Boolean(rootRef.current?.contains(target)));
    const onControl = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      Boolean(target.closest("button, a, [role=button], [role=menuitem]"));
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || isEditableTarget(e.target) || !withinReader(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Alt") {
        if (!e.repeat) capture?.enableMarqueeCapture();
        return;
      }
      if (mod || e.altKey || e.shiftKey) return;
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          scroll?.scrollToPreviousPage("smooth");
          break;
        case "ArrowRight":
          e.preventDefault();
          scroll?.scrollToNextPage("smooth");
          break;
        case "b":
        case "B":
          toggleBookmark(currentPageRef.current);
          break;
        case "d":
        case "D":
          toggleSpread();
          break;
        case "r":
        case "R":
          rotate?.rotateForward();
          break;
        case "m":
        case "M":
          useReaderPrefs.getState().toggleMargin();
          break;
        case "h":
        case "H":
          setHandTool(on => !on);
          break;
        case " ":
          if (onControl(e.target)) return;
          e.preventDefault();
          if (!e.repeat) setSpaceHeld(true);
          break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt") capture?.disableMarqueeCapture();
      if (e.key === " ") setSpaceHeld(false);
    };
    const onBlur = () => {
      capture?.disableMarqueeCapture();
      setSpaceHeld(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [capture, rotate, scroll, toggleBookmark, toggleSpread]);

  /* ───────── 渲染 ───────── */

  const renderMenu = useCallback(
    (props: SelectionMenuProps) => (
      <AnnotationMenu {...props} onDeselect={() => annotationCap?.deselectAnnotation()} />
    ),
    [annotationCap]
  );

  // 点在浮层之外：收起钉住的笔记卡与区域工具条（浮层自身阻止了按下冒泡）
  /**
   * 捕获阶段、先于引擎的原生监听：点在浮层之外就收起所有浮层与标注选中；
   * 点中的若是一条标注，引擎随后会重新选中它，所以不会误伤「点标注出工具条」。
   */
  const onViewerPointerDownCapture = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest?.(`[${OVERLAY_ATTR}]`)) return;
    annotationCap?.deselectAnnotation();
    if (pinned !== null) setPinned(null);
    if (overlay) setOverlay(null);
    setActiveRecordId(null);
  };

  return (
    <ReaderContext.Provider value={readerValue}>
      <div ref={rootRef} className="bg-surface flex min-h-0 min-w-0 flex-1">
        <LeftPanel
          open={prefs.leftOpen}
          tab={prefs.leftTab}
          onTabChange={prefs.setLeftTab}
          outline={outline}
          currentPage={currentPage}
          records={records}
          activeRecordId={activeRecordId}
          bookmarks={bookmarks}
          onJumpPage={page => scroll?.scrollToPage({ pageNumber: page, behavior: "smooth" })}
          onJumpAnnotation={jumpToRecord}
          onAnnotationToCard={record =>
            void convertMaterialToCard({ kind: "pdf-annotation", id: record.id })
          }
          onRemoveBookmark={bookmark => void bookmarkStore.remove(bookmark)}
        />
        <div
          ref={viewerRef}
          onPointerDownCapture={onViewerPointerDownCapture}
          className={cn(
            "relative flex min-h-0 min-w-0 flex-1 flex-col",
            panning && "cursor-grab active:cursor-grabbing"
          )}
        >
          {!pluginsReady ? (
            <Loading minHeight={0} className="flex-1" />
          ) : (
            <GlobalPointerProvider className="flex min-h-0 min-w-0 flex-1 flex-col">
              <Viewport
                data-pdf-viewport=""
                className={cn(FADE_SCROLL_CLASS, "min-h-0 min-w-0 flex-1 bg-transparent")}
              >
                {/* 页边展开时右侧留出页边宽度（页边本身画在每页叠加层里，溢出页面右缘） */}
                <div className="mx-auto w-fit" style={{ paddingRight: marginWidth }}>
                  <Scroller
                    renderPage={({ width, height, pageIndex, scale, rotation }) => (
                      <Rotate pageSize={{ width, height }}>
                        <PagePointerProvider
                          pageIndex={pageIndex}
                          pageWidth={width}
                          pageHeight={height}
                          rotation={rotation}
                          scale={scale}
                        >
                          <PageFrame
                            pageIndex={pageIndex}
                            width={width}
                            height={height}
                            scale={scale}
                            rotation={rotation}
                            night={prefs.nightPage}
                            marginWidth={marginWidth}
                            renderMenu={renderMenu}
                          />
                        </PagePointerProvider>
                      </Rotate>
                    )}
                  />
                </div>
                {/* 末页下方留出悬浮 HUD 的高度，滚到底时最后几行不被挡住 */}
                <div aria-hidden className="h-16" />
              </Viewport>
            </GlobalPointerProvider>
          )}

          {find.isOpen && (
            <FindBar
              mode={find.mode}
              query={find.query}
              results={find.rows}
              current={find.current}
              loading={find.loading}
              notice={find.notice}
              onModeChange={find.setMode}
              onQueryChange={find.setQuery}
              onSubmit={find.submitSemantic}
              onPick={find.pick}
              onPrev={find.prev}
              onNext={find.next}
              onClose={find.close}
            />
          )}

          {pluginsReady && (
            <Hud
              page={currentPage}
              total={totalPages}
              zoomLabel={zoomLabel}
              onPrev={() => scroll?.scrollToPreviousPage("smooth")}
              onNext={() => scroll?.scrollToNextPage("smooth")}
              onZoomIn={() => zoom?.zoomIn()}
              onZoomOut={() => zoom?.zoomOut()}
              onCycleZoom={cycleZoom}
              onFind={find.open}
              handTool={handTool}
              onToggleHand={() => setHandTool(on => !on)}
              spread={spreadMode !== SpreadMode.None}
              onToggleSpread={toggleSpread}
              onRotate={() => rotate?.rotateForward()}
              night={prefs.nightPage}
              onToggleNight={prefs.toggleNightPage}
              margin={prefs.marginOpen}
              marginAvailable={spreadMode === SpreadMode.None && rotation === 0}
              onToggleMargin={prefs.toggleMargin}
              onFullscreen={toggleFullscreen}
              onReveal={
                pdf.isLocal && resolvedPath ? () => void showInFolder(resolvedPath) : undefined
              }
              onRebuildIndex={
                resolvedPath
                  ? () => {
                      index.rebuild();
                      toast.info("正在重建 AI 索引");
                    }
                  : undefined
              }
              onToggleLeft={leftToggleInHud ? prefs.toggleLeft : undefined}
              leftOpen={prefs.leftOpen}
              onOpenChat={onOpenChat}
            />
          )}
        </div>
      </div>
    </ReaderContext.Provider>
  );
}

/**
 * 一页：位图（低清整页 + 高清分块）+ 选区 / 标注 / 叠加层 / 框选。
 * 标注与叠加层等整页位图加载出来再显示，免得高亮先于正文浮在空白页上。
 * 虚拟滚动会卸载离屏页面，回来时重新等一次（位图有缓存，几乎立即就绪）。
 */
function PageFrame({
  pageIndex,
  width,
  height,
  scale,
  rotation,
  night,
  marginWidth,
  renderMenu,
}: {
  pageIndex: number;
  width: number;
  height: number;
  scale: number;
  rotation: Rotation;
  night: boolean;
  /** 页边宽度（像素），0 = 收起 */
  marginWidth: number;
  renderMenu: (props: SelectionMenuProps) => React.JSX.Element;
}) {
  const [painted, setPainted] = useState(false);
  const [paperRgb, setPaperRgb] = useState<Rgb | null>(null);
  const paper = useMemo(
    () => (paperRgb ? paperPalette(night ? nightPaper(paperRgb) : paperRgb) : null),
    [paperRgb, night]
  );
  return (
    <div
      // 页缘：细边 + 卡片投影，纸白页面落在同色阅读区上也能看清上下沿；页边展开时由底纸统一承担
      className={cn("group/page relative", !marginWidth && "shadow-card outline-line-1 outline")}
      style={{ width, height }}
      data-page-number={pageIndex + 1}
      draggable={false}
      onDragStart={e => e.preventDefault()}
    >
      {marginWidth > 0 && (
        <div
          aria-hidden
          // 底纸取 PDF 自己的纸色，页边因此与页面同色；取不到时用主题表面色
          className={cn(
            "shadow-card outline-line-1 absolute inset-y-0 left-0 outline",
            !paper && "bg-surface"
          )}
          style={{ width: width + marginWidth, backgroundColor: paper?.paper }}
        />
      )}
      {/* 夜间页面只反色页面位图，标注与浮层保持原色 */}
      <div
        className={cn(
          "absolute inset-0 overflow-hidden",
          night && "[filter:invert(0.88)_hue-rotate(180deg)]"
        )}
      >
        <RenderLayer
          pageIndex={pageIndex}
          scale={0.5}
          onLoad={e => {
            setPainted(true);
            setPaperRgb(samplePaperColor(e.currentTarget));
          }}
        />
        <TilingLayer pageIndex={pageIndex} scale={scale} />
      </div>
      <SelectionLayer pageIndex={pageIndex} scale={scale} />
      <div
        className={cn(
          "ease-tau-out transition-opacity duration-150",
          painted ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <AnnotationLayer
          pageIndex={pageIndex}
          scale={scale}
          pageWidth={width}
          pageHeight={height}
          rotation={rotation}
          selectionMenu={renderMenu}
        />
        <PageLayer
          pageIndex={pageIndex}
          scale={scale}
          width={width}
          height={height}
          paper={paper}
        />
      </div>
      <MarqueeCapture pageIndex={pageIndex} scale={scale} />
    </div>
  );
}

/* ───────── 查找（关键词 = 引擎全文检索；按意思找 = AI 索引） ───────── */

function useFind({
  pdf,
  engine,
  doc,
  mainDbName,
  index,
  onNavigate,
  scroll,
}: {
  pdf: Pdf;
  engine: PdfEngine;
  doc: PdfDocumentObject | null;
  mainDbName: string;
  index: ReturnType<typeof usePdfIndex>;
  onNavigate: (target: PdfCitationTarget) => void;
  scroll: ReturnType<typeof useScroll>["provides"];
}) {
  const [isOpen, setOpen] = useState(false);
  const [mode, setMode] = useState<FindMode>("keyword");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchResult[]>([]);
  const [current, setCurrent] = useState(0);
  const [semantic, setSemantic] = useState<PdfSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const goTo = useCallback(
    (list: SearchResult[], i: number) => {
      const hit = list[i];
      if (!hit) return;
      setCurrent(i);
      scroll?.scrollToPage({
        pageNumber: hit.pageIndex + 1,
        ...(hit.rects[0] ? { pageCoordinates: hit.rects[0].origin, center: true } : {}),
        behavior: "smooth",
      });
    },
    [scroll]
  );

  // 关键词：输入停 250ms 检索整本，跳到第一个命中
  useEffect(() => {
    if (!isOpen || mode !== "keyword" || !doc) return;
    const keyword = query.trim();
    if (!keyword) {
      setHits([]);
      setNotice(null);
      return;
    }
    let task: SearchTask | null = null;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      task = engine.searchAllPages(doc, keyword);
      task.wait(
        result => {
          if (cancelled) return;
          setLoading(false);
          setHits(result.results);
          setNotice(result.results.length ? null : "没有找到。扫描版 PDF 可能没有可检索的文字");
          goTo(result.results, 0);
        },
        () => {
          if (!cancelled) setLoading(false);
        }
      );
    }, KEYWORD_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      task?.abort?.({ code: 0, message: "查询已更新" } as never);
    };
  }, [isOpen, mode, query, doc, engine, goTo]);

  const submitSemantic = useMemoizedFn(async () => {
    const text = query.trim();
    if (!text) return;
    setLoading(true);
    setNotice(null);
    try {
      const status = index.status?.state === "ready" ? index.status : await index.ensure();
      if (status.state === "failed") {
        setNotice(`AI 索引不可用：${status.error || "建立失败"}`);
        setSemantic([]);
        return;
      }
      const results = await searchPdfContent({ pdfId: pdf.id, mainDbName, query: text, limit: 10 });
      setSemantic(results);
      if (results.length === 0) setNotice("没有找到相关段落，可以换个说法");
    } catch (error) {
      console.error("[pdf-reader] 按意思找失败", error);
      setNotice("搜索失败，请稍后再试");
    } finally {
      setLoading(false);
    }
  });

  const rows = useMemo<FindResultRow[]>(
    () =>
      mode === "keyword"
        ? hits.map(hit => ({
            page: hit.pageIndex + 1,
            before: `${hit.context.truncatedLeft ? "…" : ""}${hit.context.before}`,
            match: hit.context.match,
            after: `${hit.context.after}${hit.context.truncatedRight ? "…" : ""}`,
          }))
        : semantic.map(result => ({
            page: result.pageNumber,
            before: "",
            match: "",
            after: result.snippet || result.content,
            score: result.score,
          })),
    [mode, hits, semantic]
  );

  const pageHits = useMemo<PageHighlight[]>(
    () =>
      isOpen && mode === "keyword"
        ? hits.map(h => ({ pageIndex: h.pageIndex, rects: h.rects }))
        : [],
    [isOpen, mode, hits]
  );
  const currentHit = useMemo(() => {
    const hit = isOpen && mode === "keyword" ? hits[current] : undefined;
    return hit?.rects[0] ? { pageIndex: hit.pageIndex, rect: hit.rects[0] } : null;
  }, [isOpen, mode, hits, current]);

  return {
    isOpen,
    mode,
    query,
    rows,
    current,
    loading,
    notice,
    hits: pageHits,
    currentHit,
    open: useCallback(() => setOpen(true), []),
    close: useCallback(() => {
      setOpen(false);
      setHits([]);
      setSemantic([]);
      setNotice(null);
    }, []),
    setQuery,
    setMode: (next: FindMode) => {
      setMode(next);
      setNotice(null);
    },
    submitSemantic: () => void submitSemantic(),
    pick: (i: number) => {
      if (mode === "keyword") goTo(hits, i);
      else {
        const result = semantic[i];
        if (result)
          onNavigate({
            pageNumber: result.pageNumber,
            previewText: result.snippet || result.content,
          });
      }
    },
    prev: () => hits.length && goTo(hits, (current - 1 + hits.length) % hits.length),
    next: () => hits.length && goTo(hits, (current + 1) % hits.length),
  };
}
