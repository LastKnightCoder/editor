import {
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
  type CSSProperties,
  type MouseEvent,
} from "react";
import classNames from "classnames";
import { Spin, Result } from "antd";
import {
  X as XIcon,
  Loader2 as Loader2Icon,
  PanelLeftOpen as PanelLeftOpenIcon,
} from "lucide-react";
import type { PluginBatchRegistrations } from "@embedpdf/core";
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
import { usePdfiumEngine } from "@embedpdf/engines/react";
import type {
  PdfAnnotationObject,
  PdfBookmarkObject,
  PdfDestinationObject,
  PdfEngine,
  PdfDocumentObject,
} from "@embedpdf/models";
import {
  PdfActionType,
  PdfAnnotationSubtype,
  PdfBlendMode,
  PdfZoomMode,
} from "@embedpdf/models";
import {
  LoaderPluginPackage,
  useLoaderCapability,
} from "@embedpdf/plugin-loader/react";
import {
  ViewportPluginPackage,
  Viewport,
} from "@embedpdf/plugin-viewport/react";
import {
  ScrollPluginPackage,
  ScrollStrategy,
  Scroller,
  useScroll,
} from "@embedpdf/plugin-scroll/react";
import {
  RenderPluginPackage,
  RenderLayer,
} from "@embedpdf/plugin-render/react";
import {
  TilingPluginPackage,
  TilingLayer,
} from "@embedpdf/plugin-tiling/react";
import {
  InteractionManagerPluginPackage,
  PagePointerProvider,
  GlobalPointerProvider,
} from "@embedpdf/plugin-interaction-manager/react";
import {
  SelectionPluginPackage,
  SelectionLayer,
  useSelectionCapability,
} from "@embedpdf/plugin-selection/react";
import {
  AnnotationPluginPackage,
  AnnotationLayer,
  useAnnotationCapability,
} from "@embedpdf/plugin-annotation/react";
import type {
  TrackedAnnotation,
  AnnotationEvent,
} from "@embedpdf/plugin-annotation";
import type { Rect, AnnotationCreateContext } from "@embedpdf/models";

type ImportAnnotationItem = {
  annotation: PdfAnnotationObject;
  ctx?: AnnotationCreateContext<PdfAnnotationObject>;
};

interface SelectionMenuProps {
  annotation: TrackedAnnotation;
  selected: boolean;
  rect: Rect;
  menuWrapperProps: {
    style?: React.CSSProperties;
    ref?: (el: HTMLDivElement | null) => void;
  };
}
import { HistoryPluginPackage } from "@embedpdf/plugin-history/react";
import {
  ZoomPluginPackage,
  MarqueeZoom,
  useZoom,
} from "@embedpdf/plugin-zoom/react";
import { ZoomMode } from "@embedpdf/plugin-zoom";
import { PanPluginPackage } from "@embedpdf/plugin-pan/react";
import {
  CapturePluginPackage,
  MarqueeCapture,
  useCaptureCapability,
} from "@embedpdf/plugin-capture/react";
import { RotatePluginPackage, Rotate } from "@embedpdf/plugin-rotate/react";
import { SpreadPluginPackage } from "@embedpdf/plugin-spread/react";
import { SpreadMode } from "@embedpdf/plugin-spread";
import { ThumbnailPluginPackage } from "@embedpdf/plugin-thumbnail/react";
import type { Pdf, Note, PdfBookmark } from "@/types";
import type { Descendant } from "slate";
import { v4 as uuidv4 } from "uuid";
import Editor from "@/components/Editor";
import useTheme from "@/hooks/useTheme";
import { usePdfFileSource } from "./hooks/usePdfFileSource";
import { usePdfAnnotations } from "./hooks/usePdfAnnotations";
import { usePdfBookmarks } from "./hooks/usePdfBookmarks";
import { usePinchZoom } from "./hooks/usePinchZoom";
import PdfEmbedSidebar, { SidebarTabKey } from "./components/Sidebar";
import PdfEmbedToolbar from "./components/Toolbar";
import AnnotationSelectionMenu from "./components/AnnotationSelectionMenu";
import AreaAnnotationLayer from "./components/AreaAnnotationLayer";
import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import { uploadResource } from "@/hooks/useUploadResource";
import type { EHighlightColor, PdfAnnotation } from "@/types";

import "./index.less";

const TEXT_MARKUP_SUBTYPES = new Set<PdfAnnotationSubtype>([
  PdfAnnotationSubtype.HIGHLIGHT,
  PdfAnnotationSubtype.UNDERLINE,
  PdfAnnotationSubtype.SQUIGGLY,
  PdfAnnotationSubtype.STRIKEOUT,
]);

interface PdfEmbedViewerProps {
  pdf: Pdf;
  className?: string;
  style?: CSSProperties;
}

const extractBookmarkDestination = (
  bookmark: PdfBookmarkObject,
): PdfDestinationObject | null => {
  if (!bookmark.target) return null;

  if (bookmark.target.type === "destination") {
    return bookmark.target.destination;
  }

  if (bookmark.target.type === "action") {
    const action = bookmark.target.action;
    if (
      action.type === PdfActionType.Goto ||
      action.type === PdfActionType.RemoteGoto
    ) {
      return action.destination;
    }
  }

  return null;
};

const PdfEmbedViewer = ({ pdf, className, style }: PdfEmbedViewerProps) => {
  const {
    engine,
    isLoading: engineLoading,
    error: engineError,
  } = usePdfiumEngine({
    worker: true,
  });
  const { status, error: fileError, pdfFile } = usePdfFileSource(pdf);
  const { isDark } = useTheme();

  const pluginRegistrations = useMemo<PluginBatchRegistrations>(() => {
    if (!pdfFile) return [];
    return [
      createPluginRegistration(LoaderPluginPackage, {
        loadingOptions: {
          type: "buffer",
          pdfFile,
        },
      }),
      createPluginRegistration(ViewportPluginPackage, {
        viewportGap: 16,
      }),
      createPluginRegistration(ScrollPluginPackage, {
        strategy: ScrollStrategy.Vertical,
        pageGap: 18,
      }),
      createPluginRegistration(SpreadPluginPackage, {
        defaultSpreadMode: SpreadMode.None,
      }),
      createPluginRegistration(RenderPluginPackage),
      createPluginRegistration(TilingPluginPackage, {
        tileSize: 768,
        overlapPx: 3,
        extraRings: 1,
      }),
      createPluginRegistration(ThumbnailPluginPackage, {
        width: 120,
        gap: 12,
      }),
      createPluginRegistration(InteractionManagerPluginPackage),
      createPluginRegistration(SelectionPluginPackage),
      createPluginRegistration(HistoryPluginPackage),
      createPluginRegistration(AnnotationPluginPackage, {
        annotationAuthor: "Tau User",
      }),
      createPluginRegistration(ZoomPluginPackage, {
        defaultZoomLevel: ZoomMode.Automatic,
      }),
      createPluginRegistration(PanPluginPackage, {
        defaultMode: "mobile",
      }),
      createPluginRegistration(CapturePluginPackage, {
        scale: 2,
        imageType: "image/png",
        withAnnotations: true,
      }),
      createPluginRegistration(RotatePluginPackage),
    ];
  }, [pdfFile]);

  const fatalError = engineError ?? fileError;

  if (fatalError) {
    return (
      <div className={classNames("pdf-embed-error", className)} style={style}>
        <Result
          status="error"
          title="PDF 加载失败"
          subTitle={fatalError.message}
        />
      </div>
    );
  }

  if (!engine || !pdfFile || pluginRegistrations.length === 0) {
    return (
      <div className={classNames("pdf-embed-loading", className)} style={style}>
        <Spin
          tip={engineLoading || status === "loading" ? "正在加载 PDF..." : ""}
        />
      </div>
    );
  }

  return (
    <div
      className={classNames(
        "pdf-embed-shell",
        { "is-dark": isDark },
        className,
      )}
      style={style}
    >
      <EmbedPDF
        engine={engine}
        plugins={pluginRegistrations}
        key={`embed-pdf-${pdf.id}-${pdf.updateTime}`}
      >
        {({ pluginsReady }) => (
          <PdfEmbedLayout
            pdf={pdf}
            engine={engine}
            pluginsReady={pluginsReady}
          />
        )}
      </EmbedPDF>
    </div>
  );
};

interface PdfEmbedLayoutProps {
  pdf: Pdf;
  engine: PdfEngine;
  pluginsReady: boolean;
}

const createEmptyNoteValue = (): Descendant[] => [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

const PdfEmbedLayout = ({ pdf, engine, pluginsReady }: PdfEmbedLayoutProps) => {
  const [outline, setOutline] = useState<PdfBookmarkObject[]>([]);
  const [activeTab, setActiveTab] = useState<SidebarTabKey>("outline");

  // 从 localStorage 读取侧边栏状态
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem("pdf-sidebar-collapsed");
    return saved ? JSON.parse(saved) : false;
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("pdf-sidebar-width");
    return saved ? parseInt(saved, 10) : 300;
  });

  // 持久化侧边栏状态
  useEffect(() => {
    localStorage.setItem(
      "pdf-sidebar-collapsed",
      JSON.stringify(sidebarCollapsed),
    );
  }, [sidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem("pdf-sidebar-width", sidebarWidth.toString());
  }, [sidebarWidth]);

  const { provides: loaderCapability } = useLoaderCapability();
  const { provides: captureCapability } = useCaptureCapability();
  const scrollHook = useScroll();
  const scrollCapability = scrollHook.provides;
  const scrollState = scrollHook.state;
  const { provides: annotationCapability } = useAnnotationCapability();
  const { provides: selectionCapability } = useSelectionCapability();
  const { provides: zoomCapability } = useZoom();
  const annotationStore = usePdfAnnotations({ pdfId: pdf.id });
  const bookmarkStore = usePdfBookmarks({ pdfId: pdf.id });
  const importedAnnotationIdsRef = useRef<Set<string>>(new Set());
  const importingAnnotationIdsRef = useRef<Set<string>>(new Set());
  const latestSelectionTextRef = useRef<string | null>(null);
  const selectionClearTimeoutRef = useRef<number | null>(null);
  const viewerPanelRef = useRef<HTMLDivElement>(null);

  // 双指缩放处理
  const handlePinchZoom = useCallback(
    (delta: number, centerX: number, centerY: number) => {
      if (!zoomCapability) return;
      // 将 viewport 坐标转换为相对于 viewerPanel 的坐标
      const panel = viewerPanelRef.current;
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      const vx = centerX - rect.left;
      const vy = centerY - rect.top;
      zoomCapability.requestZoomBy(delta, { vx, vy });
    },
    [zoomCapability],
  );

  // 绑定双指缩放手势
  usePinchZoom({
    onZoom: handlePinchZoom,
    containerRef: viewerPanelRef,
    enabled: pluginsReady,
  });

  const {
    annotations,
    upsertAnnotationObject,
    removeAnnotation,
    updateAnnotationNotes,
    createAreaAnnotation,
    updateAreaAnnotation,
  } = annotationStore;
  const { bookmarks, createBookmark, removeBookmark } = bookmarkStore;
  const [selectedAnnotationState, setSelectedAnnotationState] = useState<{
    id: string;
    pageIndex: number;
    annotation: PdfAnnotationObject;
  } | null>(null);
  const [activeNoteAnnotationId, setActiveNoteAnnotationId] = useState<
    string | null
  >(null);
  const [noteEditorValue, setNoteEditorValue] = useState<Descendant[]>(
    createEmptyNoteValue(),
  );
  const [noteSaving, setNoteSaving] = useState(false);

  const annotationIdToRecordId = useMemo(() => {
    const map = new Map<string, number>();
    annotations.forEach((entry) => {
      if (entry.annotation?.id) {
        map.set(entry.annotation.id, entry.id);
      }
    });
    return map;
  }, [annotations]);

  const captureSelectionText = useCallback(() => {
    if (!selectionCapability) return;
    try {
      const task = selectionCapability.getSelectedText();
      task.wait(
        (lines) => {
          const normalized = lines
            .map((line) => line.trim())
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
          latestSelectionTextRef.current = normalized || null;
        },
        () => {
          latestSelectionTextRef.current = null;
        },
      );
    } catch {
      latestSelectionTextRef.current = null;
    }
  }, [selectionCapability]);

  useEffect(() => {
    if (!selectionCapability) return;
    const unsubscribe = selectionCapability.onSelectionChange((range) => {
      if (range) {
        if (selectionClearTimeoutRef.current) {
          window.clearTimeout(selectionClearTimeoutRef.current);
          selectionClearTimeoutRef.current = null;
        }
        captureSelectionText();
      } else {
        if (selectionClearTimeoutRef.current) {
          window.clearTimeout(selectionClearTimeoutRef.current);
        }
        selectionClearTimeoutRef.current = window.setTimeout(() => {
          latestSelectionTextRef.current = null;
          selectionClearTimeoutRef.current = null;
        }, 500);
      }
    });
    return () => {
      unsubscribe?.();
      if (selectionClearTimeoutRef.current) {
        window.clearTimeout(selectionClearTimeoutRef.current);
        selectionClearTimeoutRef.current = null;
      }
    };
  }, [selectionCapability, captureSelectionText]);

  const enhanceAnnotationWithSnippet = useCallback(
    (
      annotation: PdfAnnotationObject,
      eventType: AnnotationEvent["type"],
    ): PdfAnnotationObject => {
      if (
        eventType !== "create" ||
        !TEXT_MARKUP_SUBTYPES.has(annotation.type as PdfAnnotationSubtype)
      ) {
        return annotation;
      }
      const snippet = latestSelectionTextRef.current?.trim();
      if (!snippet || (annotation.contents && annotation.contents.trim())) {
        return annotation;
      }
      latestSelectionTextRef.current = null;
      if (selectionClearTimeoutRef.current) {
        window.clearTimeout(selectionClearTimeoutRef.current);
        selectionClearTimeoutRef.current = null;
      }
      return {
        ...annotation,
        contents: snippet,
      };
    },
    [],
  );

  useEffect(() => {
    importedAnnotationIdsRef.current = new Set();
  }, [pdf.id]);

  useEffect(() => {
    if (!annotationCapability || !pluginsReady) return;
    const missing = annotations.filter((entry) => {
      const uid = entry.annotation?.id;
      return uid && !importedAnnotationIdsRef.current.has(uid);
    });
    if (!missing.length) return;
    const payload: ImportAnnotationItem[] = missing
      .map((entry) => ({ annotation: entry.annotation }))
      .filter((item): item is ImportAnnotationItem => Boolean(item.annotation));
    payload.forEach((item) => {
      const uid = item.annotation?.id;
      if (!uid) return;
      importingAnnotationIdsRef.current.add(uid);
      importedAnnotationIdsRef.current.add(uid);
    });
    if (payload.length) {
      annotationCapability.importAnnotations(payload);
    }
  }, [annotationCapability, pluginsReady, annotations]);

  useEffect(() => {
    if (!annotationCapability || !pluginsReady) return;
    const handler = (event: AnnotationEvent) => {
      if (event.type === "loaded") return;
      if (!event.annotation) return;
      const processedAnnotation = enhanceAnnotationWithSnippet(
        event.annotation,
        event.type,
      );
      const uid = processedAnnotation.id;
      if (uid && importingAnnotationIdsRef.current.has(uid)) {
        importingAnnotationIdsRef.current.delete(uid);
        return;
      }
      if (event.type === "delete") {
        importedAnnotationIdsRef.current.delete(uid);
        const recordId = uid ? annotationIdToRecordId.get(uid) : undefined;
        if (recordId) {
          removeAnnotation(recordId);
        }
        return;
      }
      if (!event.committed) return;
      upsertAnnotationObject(processedAnnotation)?.finally(() => {
        if (processedAnnotation?.id) {
          importedAnnotationIdsRef.current.add(processedAnnotation.id);
        }
      });
    };
    const unsubscribe = annotationCapability.onAnnotationEvent(handler);
    return () => {
      unsubscribe?.();
    };
  }, [
    annotationCapability,
    pluginsReady,
    annotationIdToRecordId,
    removeAnnotation,
    upsertAnnotationObject,
    enhanceAnnotationWithSnippet,
  ]);

  useEffect(() => {
    if (!annotationCapability) return;
    const updateSelection = () => {
      const selection = annotationCapability.getSelectedAnnotation?.();
      if (!selection) {
        setSelectedAnnotationState(null);
        return;
      }
      setSelectedAnnotationState({
        id: selection.object.id,
        pageIndex: selection.object.pageIndex ?? 0,
        annotation: selection.object,
      });
    };
    updateSelection();
    const unsubscribe = annotationCapability.onStateChange(() => {
      updateSelection();
    });
    return () => {
      unsubscribe?.();
    };
  }, [annotationCapability]);

  useEffect(() => {
    if (!loaderCapability || !engine) return;
    let cancelled = false;

    const handleDocumentLoaded = (doc: PdfDocumentObject) => {
      if (!doc || cancelled) return;
      engine.getBookmarks(doc).wait(
        (result) => {
          if (!cancelled) {
            setOutline(result?.bookmarks ?? []);
          }
        },
        (error) => {
          if (!cancelled) {
            console.error("获取 PDF 目录失败", error);
          }
        },
      );
    };

    const currentDoc = loaderCapability.getDocument();
    if (currentDoc) {
      handleDocumentLoaded(currentDoc);
    }

    const unsubscribe = loaderCapability.onDocumentLoaded(handleDocumentLoaded);

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [loaderCapability, engine]);

  useEffect(() => {
    if (!captureCapability) return;
    const unsubscribe = captureCapability.onCaptureArea(async (event) => {
      // 上传截图并创建区域标注
      try {
        const file = new File([event.blob], `pdf-capture-${Date.now()}.png`, {
          type: "image/png",
        });
        const captureUrl = await uploadResource(file);
        if (captureUrl) {
          // 从 event.rect 获取坐标 (Rect 类型: { origin: Position, size: Size })
          const rect = event.rect;
          await createAreaAnnotation({
            areaData: {
              rect: {
                x: rect.origin.x,
                y: rect.origin.y,
                width: rect.size.width,
                height: rect.size.height,
              },
              captureUrl,
              pageIndex: event.pageIndex,
            },
          });
          // 关闭截图模式
          captureCapability.disableMarqueeCapture();
        }
      } catch (error) {
        console.error("Failed to create area annotation:", error);
      }
    });
    return () => {
      unsubscribe?.();
    };
  }, [captureCapability, createAreaAnnotation]);

  const handleOutlineSelect = useCallback(
    (bookmark: PdfBookmarkObject) => {
      if (!scrollCapability) return;
      const destination = extractBookmarkDestination(bookmark);
      if (!destination) return;
      const pageNumber = (destination.pageIndex ?? 0) + 1;
      scrollCapability.scrollToPage({
        pageNumber,
        behavior: "smooth",
      });
    },
    [scrollCapability],
  );

  const handleBookmarkSelect = useCallback(
    (bookmark: PdfBookmark) => {
      if (!scrollCapability) return;
      const destination = extractBookmarkDestination(bookmark.bookmark);
      if (!destination) return;
      scrollCapability.scrollToPage({
        pageNumber: (destination.pageIndex ?? 0) + 1,
        behavior: "smooth",
      });
    },
    [scrollCapability],
  );

  const handleAnnotationClick = useCallback(
    (item: (typeof annotations)[0]) => {
      // 区域标注的处理
      if (item.type === "area") {
        const pageIndex = item.areaData?.pageIndex ?? 0;
        if (scrollCapability) {
          scrollCapability.scrollToPage({
            pageNumber: pageIndex + 1,
            behavior: "smooth",
          });
        }
        setSelectedAreaAnnotationId(item.id);
        return;
      }

      // 文本标注的处理
      if (!item.annotation) return;
      const pageIndex = item.annotation.pageIndex ?? 0;
      // Scroll to the page
      if (scrollCapability) {
        scrollCapability.scrollToPage({
          pageNumber: pageIndex + 1,
          behavior: "smooth",
        });
      }
      // Select the annotation
      if (annotationCapability && item.annotation.id) {
        annotationCapability.selectAnnotation(pageIndex, item.annotation.id);
      }
    },
    [scrollCapability, annotationCapability],
  );

  const handleAnnotationEdit = useCallback((item: (typeof annotations)[0]) => {
    // 区域标注的笔记编辑
    if (item.type === "area" && item.annotation?.id) {
      setActiveNoteAnnotationId(item.annotation.id);
      return;
    }
    // 文本标注的笔记编辑
    if (!item.annotation?.id) return;
    setActiveNoteAnnotationId(item.annotation.id);
  }, []);

  const handleBookmarkDelete = useCallback(
    (bookmark: PdfBookmark) => {
      removeBookmark(bookmark.id);
    },
    [removeBookmark],
  );

  const handleAddBookmark = useCallback(() => {
    if (!createBookmark) return;
    const currentPageIndex = Math.max(0, (scrollState?.currentPage ?? 1) - 1);
    const bookmarkObject: PdfBookmarkObject = {
      title: `书签 第${currentPageIndex + 1} 页`,
      target: {
        type: "destination",
        destination: {
          pageIndex: currentPageIndex,
          zoom: { mode: PdfZoomMode.Unknown },
          view: [],
        },
      },
      children: [],
    };
    createBookmark(bookmarkObject);
  }, [createBookmark, scrollState?.currentPage]);

  const handleAnnotationColorChange = useCallback(
    (color: string) => {
      if (!annotationCapability || !selectedAnnotationState) return;
      annotationCapability.updateAnnotation(
        selectedAnnotationState.pageIndex,
        selectedAnnotationState.annotation.id,
        { color },
      );
    },
    [annotationCapability, selectedAnnotationState],
  );

  const handleAnnotationStyleChange = useCallback(
    (subtype: PdfAnnotationSubtype) => {
      if (!annotationCapability || !selectedAnnotationState) return;
      // Create patch with proper typing - updateAnnotation accepts Partial<PdfAnnotationObject>
      // which means it can handle type changes along with other properties
      const patch: Record<string, unknown> = {
        type: subtype,
      };
      if (subtype === PdfAnnotationSubtype.HIGHLIGHT) {
        patch.blendMode = PdfBlendMode.Multiply;
      } else {
        patch.blendMode = undefined;
      }
      annotationCapability.updateAnnotation(
        selectedAnnotationState.pageIndex,
        selectedAnnotationState.annotation.id,
        patch as Partial<PdfAnnotationObject>,
      );
    },
    [annotationCapability, selectedAnnotationState],
  );

  const handleAnnotationDelete = useCallback(
    (annotationId: string, pageIndex: number) => {
      if (!annotationCapability) return;
      annotationCapability.deleteAnnotation(pageIndex, annotationId);
    },
    [annotationCapability],
  );

  const handleOpenAnnotationNote = useCallback((annotationId?: string) => {
    if (!annotationId) return;
    setActiveNoteAnnotationId(annotationId);
  }, []);

  // 区域标注相关状态和处理函数
  const [selectedAreaAnnotationId, setSelectedAreaAnnotationId] = useState<
    number | null
  >(null);

  const handleAreaAnnotationSelect = useCallback(
    (annotation: PdfAnnotation) => {
      setSelectedAreaAnnotationId(annotation.id);
    },
    [],
  );

  const handleAreaAnnotationColorChange = useCallback(
    async (annotation: PdfAnnotation, color: EHighlightColor) => {
      await updateAreaAnnotation(annotation.id, { color });
    },
    [updateAreaAnnotation],
  );

  const handleAreaAnnotationAddNote = useCallback(
    (annotation: PdfAnnotation) => {
      if (!annotation.annotation?.id) return;
      setActiveNoteAnnotationId(annotation.annotation.id);
    },
    [],
  );

  const handleAreaAnnotationDelete = useCallback(
    async (annotation: PdfAnnotation) => {
      await removeAnnotation(annotation.id);
      setSelectedAreaAnnotationId(null);
    },
    [removeAnnotation],
  );

  const handleViewerPointerDown = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const target = event.target as HTMLElement | null;

      // 取消区域标注选中（点击区域标注层外部时）
      if (selectedAreaAnnotationId !== null) {
        if (!target?.closest(".pdf-area-annotation-layer")) {
          setSelectedAreaAnnotationId(null);
        }
      }

      // 取消文本标注选中
      if (!annotationCapability) return;
      const selected = annotationCapability.getSelectedAnnotation?.();
      if (!selected) return;
      if (target && target.closest(".pdf-annotation-layer")) {
        return;
      }
      annotationCapability.deselectAnnotation?.();
    },
    [annotationCapability, selectedAreaAnnotationId],
  );

  const renderSelectionMenu = useCallback(
    (menuProps: SelectionMenuProps) => (
      <AnnotationSelectionMenu
        {...menuProps}
        onColorChange={handleAnnotationColorChange}
        onStyleChange={handleAnnotationStyleChange}
        onAddNote={() =>
          handleOpenAnnotationNote(menuProps.annotation.object.id)
        }
        onDelete={() =>
          handleAnnotationDelete(
            menuProps.annotation.object.id,
            menuProps.annotation.object.pageIndex ?? 0,
          )
        }
      />
    ),
    [
      handleAnnotationColorChange,
      handleAnnotationStyleChange,
      handleOpenAnnotationNote,
      handleAnnotationDelete,
    ],
  );

  const activeNoteAnnotation = useMemo(() => {
    if (!activeNoteAnnotationId) return null;
    const recordId = annotationIdToRecordId.get(activeNoteAnnotationId);
    if (!recordId) return null;
    return annotations.find((item) => item.id === recordId) ?? null;
  }, [activeNoteAnnotationId, annotationIdToRecordId, annotations]);

  useEffect(() => {
    if (!activeNoteAnnotation) {
      setNoteEditorValue(createEmptyNoteValue());
      return;
    }
    const existing = activeNoteAnnotation.notes?.[0]?.note;
    setNoteEditorValue(
      existing && existing.length ? existing : createEmptyNoteValue(),
    );
  }, [activeNoteAnnotation]);

  const handleCloseNotePanel = useCallback(() => {
    if (noteSaving) return;
    setActiveNoteAnnotationId(null);
  }, [noteSaving]);

  const handleSubmitNote = useCallback(async () => {
    if (!activeNoteAnnotation) return;
    setNoteSaving(true);
    try {
      const baseNote = activeNoteAnnotation.notes?.[0];
      const notePayload: Note = baseNote
        ? { ...baseNote, note: noteEditorValue }
        : { id: uuidv4(), note: noteEditorValue };
      await updateAnnotationNotes(activeNoteAnnotation.id, [notePayload]);
      setActiveNoteAnnotationId(null);
    } finally {
      setNoteSaving(false);
    }
  }, [activeNoteAnnotation, noteEditorValue, updateAnnotationNotes]);

  return (
    <>
      <PdfEmbedToolbar onAddBookmark={handleAddBookmark} />
      <div className="pdf-embed-body">
        {/* 折叠状态下显示展开按钮 - 绝对定位不影响布局 */}
        {sidebarCollapsed && (
          <div className="pdf-embed-sidebar pdf-embed-sidebar-collapsed">
            <button
              type="button"
              className="pdf-sidebar-collapse-btn"
              onClick={() => setSidebarCollapsed(false)}
              title="展开侧边栏"
            >
              <PanelLeftOpenIcon size={18} />
            </button>
          </div>
        )}

        {/* 完整侧边栏 - 通过 open 属性控制动画 */}
        <ResizableAndHideableSidebar
          width={sidebarWidth}
          open={!sidebarCollapsed}
          onWidthChange={(width) => setSidebarWidth(width)}
          minWidth={240}
          maxWidth={480}
          side="right"
        >
          <PdfEmbedSidebar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            outline={outline}
            onOutlineSelect={handleOutlineSelect}
            bookmarks={bookmarks}
            onBookmarkSelect={handleBookmarkSelect}
            onBookmarkDelete={handleBookmarkDelete}
            annotations={annotations}
            onAnnotationDelete={(item) => {
              if (!item.annotation?.id) return;
              handleAnnotationDelete(
                item.annotation.id,
                item.annotation.pageIndex ?? 0,
              );
              updateAnnotationNotes(item.id, []);
            }}
            onAnnotationClick={handleAnnotationClick}
            onAnnotationEdit={handleAnnotationEdit}
            onCollapsedChange={setSidebarCollapsed}
          />
        </ResizableAndHideableSidebar>
        <div
          className="pdf-embed-viewer-panel"
          ref={viewerPanelRef}
          onMouseDownCapture={handleViewerPointerDown}
        >
          {!pluginsReady ? (
            <div className="pdf-embed-loading">
              <Spin tip="正在初始化 PDF 引擎..." />
            </div>
          ) : (
            <GlobalPointerProvider className="pdf-embed-global-pointer">
              <Viewport className="pdf-embed-viewport">
                <Scroller
                  renderPage={({
                    width,
                    height,
                    pageIndex,
                    scale,
                    rotation,
                  }) => (
                    <Rotate pageSize={{ width, height }}>
                      <PagePointerProvider
                        pageIndex={pageIndex}
                        pageWidth={width}
                        pageHeight={height}
                        rotation={rotation}
                        scale={scale}
                      >
                        <div
                          className="pdf-embed-page"
                          style={{ width, height }}
                          data-page-number={pageIndex + 1}
                        >
                          <RenderLayer pageIndex={pageIndex} scale={0.5} />
                          <TilingLayer pageIndex={pageIndex} scale={scale} />
                          <SelectionLayer pageIndex={pageIndex} scale={scale} />
                          <AnnotationLayer
                            className="pdf-annotation-layer"
                            pageIndex={pageIndex}
                            scale={scale}
                            pageWidth={width}
                            pageHeight={height}
                            rotation={rotation}
                            selectionMenu={renderSelectionMenu}
                          />
                          <AreaAnnotationLayer
                            pageIndex={pageIndex}
                            scale={scale}
                            pageWidth={width}
                            pageHeight={height}
                            annotations={annotations}
                            selectedAnnotationId={selectedAreaAnnotationId}
                            onSelect={handleAreaAnnotationSelect}
                            onColorChange={handleAreaAnnotationColorChange}
                            onAddNote={handleAreaAnnotationAddNote}
                            onDelete={handleAreaAnnotationDelete}
                          />
                          <MarqueeZoom pageIndex={pageIndex} scale={scale} />
                          <MarqueeCapture pageIndex={pageIndex} scale={scale} />
                        </div>
                      </PagePointerProvider>
                    </Rotate>
                  )}
                />
              </Viewport>
            </GlobalPointerProvider>
          )}
        </div>
      </div>
      {activeNoteAnnotationId ? (
        <div className="pdf-annotation-note-panel">
          <div className="pdf-annotation-note-panel-header">
            <h3 className="pdf-annotation-note-panel-title">编辑笔记</h3>
            <button
              type="button"
              className="pdf-annotation-note-panel-close"
              onClick={handleCloseNotePanel}
              disabled={noteSaving}
              aria-label="关闭"
            >
              <XIcon size={18} />
            </button>
          </div>
          {activeNoteAnnotation ? (
            <>
              <div className="pdf-annotation-note-panel-editor">
                <Editor
                  key={activeNoteAnnotation.id}
                  initValue={noteEditorValue}
                  onChange={setNoteEditorValue}
                  readonly={false}
                  theme="dark"
                />
              </div>
              <div className="pdf-annotation-note-panel-actions">
                <button
                  type="button"
                  className="pdf-note-btn pdf-note-btn-ghost"
                  onClick={handleCloseNotePanel}
                  disabled={noteSaving}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="pdf-note-btn pdf-note-btn-primary"
                  onClick={handleSubmitNote}
                  disabled={noteSaving}
                >
                  {noteSaving ? (
                    <>
                      <Loader2Icon size={16} className="pdf-note-btn-spinner" />
                      保存中...
                    </>
                  ) : (
                    "保存"
                  )}
                </button>
              </div>
            </>
          ) : (
            <div className="pdf-annotation-note-panel-placeholder">
              标注正在保存，请稍后再试...
            </div>
          )}
        </div>
      ) : null}
    </>
  );
};

export default PdfEmbedViewer;
