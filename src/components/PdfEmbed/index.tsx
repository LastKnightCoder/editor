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
import { Spin, Result, Button } from "antd";
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
import { ZoomPluginPackage, MarqueeZoom } from "@embedpdf/plugin-zoom/react";
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
import PdfEmbedSidebar, { SidebarTabKey } from "./components/Sidebar";
import PdfEmbedToolbar from "./components/Toolbar";
import AnnotationSelectionMenu from "./components/AnnotationSelectionMenu";

import "./index.less";

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

interface CapturePreview {
  url: string;
  pageIndex: number;
}

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
  const [capturePreview, setCapturePreview] = useState<CapturePreview | null>(
    null,
  );
  const { provides: loaderCapability } = useLoaderCapability();
  const { provides: captureCapability } = useCaptureCapability();
  const scrollHook = useScroll();
  const scrollCapability = scrollHook.provides;
  const scrollState = scrollHook.state;
  const { provides: annotationCapability } = useAnnotationCapability();
  const annotationStore = usePdfAnnotations({ pdfId: pdf.id });
  const bookmarkStore = usePdfBookmarks({ pdfId: pdf.id });
  const importedAnnotationIdsRef = useRef<Set<string>>(new Set());
  const importingAnnotationIdsRef = useRef<Set<string>>(new Set());
  const {
    annotations,
    upsertAnnotationObject,
    removeAnnotation,
    updateAnnotationNotes,
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
  const headerMeta =
    pdf.tags && pdf.tags.length > 0
      ? pdf.tags.slice(0, 3).join(" · ")
      : pdf.category || "PDF 文档";

  const annotationIdToRecordId = useMemo(() => {
    const map = new Map<string, number>();
    annotations.forEach((entry) => {
      if (entry.annotation?.id) {
        map.set(entry.annotation.id, entry.id);
      }
    });
    return map;
  }, [annotations]);

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
      const uid = event.annotation.id;
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
      upsertAnnotationObject(event.annotation)?.finally(() => {
        if (event.annotation?.id) {
          importedAnnotationIdsRef.current.add(event.annotation.id);
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
    const unsubscribe = captureCapability.onCaptureArea((event) => {
      const url = URL.createObjectURL(event.blob);
      setCapturePreview((prev) => {
        if (prev?.url) {
          URL.revokeObjectURL(prev.url);
        }
        return {
          url,
          pageIndex: event.pageIndex,
        };
      });
    });
    return () => {
      unsubscribe?.();
    };
  }, [captureCapability]);

  useEffect(() => {
    return () => {
      if (capturePreview?.url) {
        URL.revokeObjectURL(capturePreview.url);
      }
    };
  }, [capturePreview]);

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

  const handleAnnotationNoteChange = useCallback(
    (id: number, notes: Note[]) => {
      updateAnnotationNotes(id, notes);
    },
    [updateAnnotationNotes],
  );

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

  const handleOpenAnnotationNote = useCallback((annotationId?: string) => {
    if (!annotationId) return;
    setActiveNoteAnnotationId(annotationId);
  }, []);

  const handleViewerPointerDown = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (!annotationCapability) return;
      const selected = annotationCapability.getSelectedAnnotation?.();
      if (!selected) return;
      const target = event.target as HTMLElement | null;
      if (target && target.closest(".pdf-annotation-layer")) {
        return;
      }
      annotationCapability.deselectAnnotation?.();
    },
    [annotationCapability],
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
      />
    ),
    [
      handleAnnotationColorChange,
      handleAnnotationStyleChange,
      handleOpenAnnotationNote,
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

  const handleDismissCapturePreview = useCallback(() => {
    setCapturePreview((prev) => {
      if (prev?.url) {
        URL.revokeObjectURL(prev.url);
      }
      return null;
    });
  }, []);

  return (
    <>
      <div className="pdf-embed-header">
        <div className="pdf-header-info">
          <div className="pdf-header-title">{pdf.fileName}</div>
          <div className="pdf-header-meta">{headerMeta}</div>
        </div>
        <div className="pdf-header-meta-secondary">
          {Math.max(1, scrollState?.totalPages ?? 1)} 页文档
        </div>
      </div>
      <PdfEmbedToolbar onAddBookmark={handleAddBookmark} />
      <div className="pdf-embed-body">
        <PdfEmbedSidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          outline={outline}
          onOutlineSelect={handleOutlineSelect}
          bookmarks={bookmarks}
          onBookmarkSelect={handleBookmarkSelect}
          onBookmarkDelete={handleBookmarkDelete}
          annotations={annotations}
          onAnnotationNoteChange={handleAnnotationNoteChange}
        />
        <div
          className="pdf-embed-viewer-panel"
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
          {capturePreview ? (
            <div className="pdf-capture-toast">
              <img src={capturePreview.url} alt="区域截图" />
              <div className="pdf-capture-toast-meta">
                <div>区域截图已保存</div>
                <div>第 {capturePreview.pageIndex + 1} 页</div>
              </div>
              <button
                type="button"
                className="pdf-capture-toast-close"
                onClick={handleDismissCapturePreview}
              >
                ×
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {activeNoteAnnotationId ? (
        <div className="pdf-annotation-note-panel">
          <div className="pdf-annotation-note-panel-header">
            <div className="pdf-annotation-note-panel-title">
              {activeNoteAnnotation
                ? `第 ${(activeNoteAnnotation.annotation.pageIndex ?? 0) + 1} 页笔记`
                : "正在准备笔记..."}
            </div>
            <Button
              size="small"
              type="text"
              onClick={handleCloseNotePanel}
              disabled={noteSaving}
            >
              关闭
            </Button>
          </div>
          {activeNoteAnnotation ? (
            <>
              <div className="pdf-annotation-note-panel-editor">
                <Editor
                  key={activeNoteAnnotation.id}
                  initValue={noteEditorValue}
                  onChange={setNoteEditorValue}
                  readonly={false}
                />
              </div>
              <div className="pdf-annotation-note-panel-actions">
                <Button onClick={handleCloseNotePanel} disabled={noteSaving}>
                  取消
                </Button>
                <Button
                  type="primary"
                  onClick={handleSubmitNote}
                  loading={noteSaving}
                >
                  保存
                </Button>
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
