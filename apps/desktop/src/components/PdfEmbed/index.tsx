import {
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { getDescriptionKit } from "@/services/editorKit";
import classNames from "classnames";
import { App, Result } from "antd";
import { X as XIcon, Loader2 as Loader2Icon } from "lucide-react";
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
import { PdfActionType, PdfAnnotationSubtype, PdfBlendMode, PdfZoomMode } from "@embedpdf/models";
import { LoaderPluginPackage, useLoaderCapability } from "@embedpdf/plugin-loader/react";
import { ViewportPluginPackage, Viewport } from "@embedpdf/plugin-viewport/react";
import {
  ScrollPluginPackage,
  ScrollStrategy,
  Scroller,
  useScroll,
} from "@embedpdf/plugin-scroll/react";
import { RenderPluginPackage, RenderLayer } from "@embedpdf/plugin-render/react";
import { TilingPluginPackage, TilingLayer } from "@embedpdf/plugin-tiling/react";
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
import type { TrackedAnnotation, AnnotationEvent } from "@embedpdf/plugin-annotation";
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
import { ZoomPluginPackage, MarqueeZoom, useZoom } from "@embedpdf/plugin-zoom/react";
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
import type {
  Pdf,
  Note,
  PdfBookmark,
  PdfAnnotation,
  EHighlightColor,
  PdfIndexStatus,
  PdfSearchResult,
} from "@/types";
import type { Descendant } from "slate";
import { v4 as uuidv4 } from "uuid";
import { Editor } from "@tau/editor/src";
import useThemeColors from "@/hooks/useThemeColors";
import useSettingStore from "@/stores/useSettingStore";
import { ensurePdfIndex, getPdfIndexStatus, searchPdfContent } from "@/commands";
import type { PdfCitationTarget } from "@/utils/pdfCitation";
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
import { LoadingOutlined } from "@ant-design/icons";

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
  onAskAI?: (context: PdfAskAIContext) => void;
  jumpTarget?: PdfCitationTarget | null;
}

export interface PdfAskAIContext {
  kind: "selection" | "annotation" | "area";
  pageNumber: number;
  text?: string;
  captureUrl?: string;
}

export type { PdfCitationTarget } from "@/utils/pdfCitation";

const normalizeCitationLocatorText = (text: string): string =>
  text.replace(/\s+/g, " ").trim().toLowerCase();

const buildCitationLocatorSnippets = (previewText?: string): string[] => {
  const normalized = normalizeCitationLocatorText(previewText || "");
  if (!normalized) {
    return [];
  }

  const snippets = [
    normalized,
    normalized.slice(0, 48),
    normalized.slice(0, 32),
    normalized.slice(0, 20),
  ]
    .map(item => item.trim())
    .filter(item => item.length >= 8);

  return [...new Set(snippets)];
};

const buildSearchLocatorTerms = (query: string): string[] => {
  const normalized = query.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return [];
  }

  const phrases = normalized
    .split(/\s+/)
    .map(item => item.trim())
    .filter(item => item.length >= 2);

  return [...new Set([normalized, ...phrases])];
};

const buildSearchNavigationTarget = (result: PdfSearchResult, query: string): PdfCitationTarget => {
  const terms = buildSearchLocatorTerms(query);
  const content = result.content || result.snippet || "";
  const lowerContent = content.toLowerCase();

  for (const term of terms) {
    const lowerTerm = term.toLowerCase();
    const offset = lowerContent.indexOf(lowerTerm);
    if (offset < 0) {
      continue;
    }

    const start = result.charStart + offset;
    const end = start + term.length;
    const previewStart = Math.max(0, offset - 24);
    const previewEnd = Math.min(content.length, offset + term.length + 48);

    return {
      pageNumber: result.pageNumber,
      charStart: start,
      charEnd: end,
      previewText: content.slice(previewStart, previewEnd).trim() || term,
    };
  }

  return {
    pageNumber: result.pageNumber,
    charStart: result.charStart,
    charEnd: result.charEnd,
    previewText: result.snippet || result.content,
  };
};

const uniqueCitationElements = (
  segments: Array<{
    node: Text;
    start: number;
    end: number;
  }>,
  start: number,
  end: number
): HTMLElement[] => [
  ...new Set(
    segments
      .filter(segment => segment.end > start && segment.start < end)
      .map(segment => segment.node.parentElement)
      .filter((element): element is HTMLElement => Boolean(element))
  ),
];

const locateCitationTextInPage = (
  pageElement: HTMLElement,
  target: PdfCitationTarget
): HTMLElement[] => {
  if (typeof document === "undefined") {
    return [];
  }

  const walker = document.createTreeWalker(pageElement, NodeFilter.SHOW_TEXT);
  const segments: Array<{
    node: Text;
    start: number;
    end: number;
  }> = [];
  let combined = "";

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const normalized = normalizeCitationLocatorText(node.textContent || "");
    if (!normalized) {
      continue;
    }
    const start = combined.length === 0 ? 0 : combined.length + 1;
    combined = combined.length === 0 ? normalized : `${combined} ${normalized}`;
    segments.push({
      node,
      start,
      end: combined.length,
    });
  }

  if (!combined || segments.length === 0) {
    return [];
  }

  if (typeof target.charStart === "number") {
    const normalizedCharStart = Math.max(0, target.charStart);
    const normalizedCharEnd = Math.max(
      normalizedCharStart + 1,
      typeof target.charEnd === "number" ? target.charEnd : normalizedCharStart + 1
    );

    const directMatch = uniqueCitationElements(segments, normalizedCharStart, normalizedCharEnd);
    if (directMatch.length > 0) {
      return directMatch;
    }

    const expandedMatch = uniqueCitationElements(
      segments,
      Math.max(0, normalizedCharStart - 48),
      Math.min(combined.length, normalizedCharEnd + 48)
    );
    if (expandedMatch.length > 0) {
      return expandedMatch;
    }
  }

  const snippets = buildCitationLocatorSnippets(target.previewText);
  for (const snippet of snippets) {
    const matchIndex = combined.indexOf(snippet);
    if (matchIndex < 0) {
      continue;
    }

    const matchEnd = matchIndex + snippet.length;
    const matchedElements = uniqueCitationElements(segments, matchIndex, matchEnd);

    if (matchedElements.length > 0) {
      return matchedElements;
    }
  }

  return [];
};

const extractBookmarkDestination = (bookmark: PdfBookmarkObject): PdfDestinationObject | null => {
  if (!bookmark.target) return null;

  if (bookmark.target.type === "destination") {
    return bookmark.target.destination;
  }

  if (bookmark.target.type === "action") {
    const action = bookmark.target.action;
    if (action.type === PdfActionType.Goto || action.type === PdfActionType.RemoteGoto) {
      return action.destination;
    }
  }

  return null;
};

const PdfEmbedViewer = ({ pdf, className, style, onAskAI, jumpTarget }: PdfEmbedViewerProps) => {
  const { engine, error: engineError } = usePdfiumEngine({
    worker: true,
  });
  const { error: fileError, pdfFile, resolvedPath } = usePdfFileSource(pdf);
  const themeColors = useThemeColors();

  const panDefaultMode = useMemo<"mobile" | "never">(() => {
    if (typeof window === "undefined") return "never";
    const hasTouchPoints = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
    const supportsMatchMedia = typeof window.matchMedia === "function";
    if (!supportsMatchMedia) {
      return hasTouchPoints ? "mobile" : "never";
    }
    const prefersCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const hasFinePointer = window.matchMedia("(any-pointer: fine)").matches;
    const isTouchOnlyDevice = hasTouchPoints && prefersCoarsePointer && !hasFinePointer;
    return isTouchOnlyDevice ? "mobile" : "never";
  }, []);

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
        defaultMode: panDefaultMode,
      }),
      createPluginRegistration(CapturePluginPackage, {
        scale: 2,
        imageType: "image/png",
        withAnnotations: true,
      }),
      createPluginRegistration(RotatePluginPackage),
    ];
  }, [pdfFile, panDefaultMode]);

  const fatalError = engineError ?? fileError;

  if (fatalError) {
    return (
      <div
        className={classNames(
          "flex h-full w-full items-center justify-center",
          themeColors.textClass,
          className
        )}
        style={style}
      >
        <Result status="error" title="PDF 加载失败" subTitle={fatalError.message} />
      </div>
    );
  }

  if (!engine || !pdfFile || pluginRegistrations.length === 0) {
    return (
      <div
        className={classNames(
          "flex h-full w-full items-center justify-center",
          themeColors.textClass,
          className
        )}
        style={style}
      >
        <LoadingOutlined spin />
      </div>
    );
  }

  return (
    <div
      className={classNames("flex h-full w-full flex-col", themeColors.activeTextClass, className)}
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
            resolvedPath={resolvedPath}
            onAskAI={onAskAI}
            jumpTarget={jumpTarget}
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
  resolvedPath?: string;
  onAskAI?: (context: PdfAskAIContext) => void;
  jumpTarget?: PdfCitationTarget | null;
}

const createEmptyNoteValue = (): Descendant[] => [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

// 笔记编辑面板组件
interface NoteEditPanelProps {
  activeNoteAnnotation: PdfAnnotation | null;
  noteEditorValue: Descendant[];
  setNoteEditorValue: (value: Descendant[]) => void;
  noteSaving: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

const NoteEditPanel = ({
  activeNoteAnnotation,
  noteEditorValue,
  setNoteEditorValue,
  noteSaving,
  onClose,
  onSubmit,
}: NoteEditPanelProps) => {
  const themeColors = useThemeColors();

  const panelBg = classNames(
    themeColors.glassPanelBg,
    "backdrop-blur-xl backdrop-saturate-150",
    themeColors.cardBorderClass
  );

  const editorContainerBg = classNames(themeColors.cardBgClass, themeColors.cardBorderClass);
  const titleTextClass = themeColors.activeTextClass;
  const closeButtonClass = classNames(
    themeColors.textClass,
    themeColors.hoverClass,
    themeColors.hoverTextClass
  );
  const cancelButtonClass = classNames(
    themeColors.textClass,
    themeColors.hoverClass,
    themeColors.hoverTextClass
  );
  const submitButtonClass = classNames(
    themeColors.buttonBg,
    themeColors.buttonTextClass,
    "hover:opacity-90"
  );

  return (
    <div
      className={classNames(
        "absolute bottom-8 left-1/2 z-20 w-[min(720px,calc(100%-64px))] -translate-x-1/2",
        "flex flex-col gap-4 rounded-2xl border p-5",
        "shadow-[0_20px_60px_rgba(0,0,0,0.25)]",
        panelBg
      )}
    >
      <div className="flex items-center justify-between">
        <h3 className={classNames("m-0 text-base font-bold", titleTextClass)}>编辑笔记</h3>
        <button
          type="button"
          className={classNames(
            "inline-flex h-8 w-8 items-center justify-center rounded-lg bg-transparent transition disabled:opacity-50",
            closeButtonClass
          )}
          onClick={onClose}
          disabled={noteSaving}
          aria-label="关闭"
        >
          <XIcon size={18} />
        </button>
      </div>
      {activeNoteAnnotation ? (
        <>
          <div
            className={classNames(
              "min-h-[140px] rounded-xl border p-3 transition",
              "focus-within:ring-[var(--th-accent)]/20 focus-within:ring-2",
              editorContainerBg
            )}
          >
            <Editor
              kit={getDescriptionKit()}
              key={activeNoteAnnotation.id}
              initValue={noteEditorValue}
              onChange={setNoteEditorValue}
              readonly={false}
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              className={classNames(
                "inline-flex items-center gap-2 rounded-lg bg-transparent px-5 py-2.5 text-sm font-medium transition disabled:opacity-50",
                cancelButtonClass
              )}
              onClick={onClose}
              disabled={noteSaving}
            >
              取消
            </button>
            <button
              type="button"
              className={classNames(
                "inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition disabled:opacity-50",
                submitButtonClass
              )}
              onClick={onSubmit}
              disabled={noteSaving}
            >
              {noteSaving ? (
                <>
                  <Loader2Icon size={16} className="animate-spin" />
                  保存中...
                </>
              ) : (
                "保存"
              )}
            </button>
          </div>
        </>
      ) : (
        <div className={classNames("p-6 text-center text-sm", themeColors.textClass)}>
          标注正在保存，请稍后再试...
        </div>
      )}
    </div>
  );
};

const PdfEmbedLayout = ({
  pdf,
  engine,
  pluginsReady,
  resolvedPath,
  onAskAI,
  jumpTarget,
}: PdfEmbedLayoutProps) => {
  const { message } = App.useApp();
  const [outline, setOutline] = useState<PdfBookmarkObject[]>([]);
  const [activeTab, setActiveTab] = useState<SidebarTabKey>("outline");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResultQuery, setSearchResultQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PdfSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedSearchResultKey, setSelectedSearchResultKey] = useState<string | null>(null);
  const [indexStatus, setIndexStatus] = useState<PdfIndexStatus | null>(null);
  const [selectedTextForAskAI, setSelectedTextForAskAI] = useState("");

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
    localStorage.setItem("pdf-sidebar-collapsed", JSON.stringify(sidebarCollapsed));
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
  const mainDbName = useSettingStore(state => state.setting.database.active);
  const annotationStore = usePdfAnnotations({ pdfId: pdf.id });
  const bookmarkStore = usePdfBookmarks({ pdfId: pdf.id });
  const importedAnnotationIdsRef = useRef<Set<string>>(new Set());
  const importingAnnotationIdsRef = useRef<Set<string>>(new Set());
  const latestSelectionTextRef = useRef<string | null>(null);
  const selectionClearTimeoutRef = useRef<number | null>(null);
  const viewerPanelRef = useRef<HTMLDivElement>(null);
  const citationNavigationTimerRefs = useRef<number[]>([]);
  const highlightedCitationElementsRef = useRef<HTMLElement[]>([]);

  const clearCitationHighlights = useCallback(() => {
    highlightedCitationElementsRef.current.forEach(element => {
      element.style.removeProperty("background-color");
      element.style.removeProperty("box-shadow");
      element.style.removeProperty("border-radius");
      element.style.removeProperty("transition");
    });
    highlightedCitationElementsRef.current = [];
  }, []);

  const clearCitationNavigationTimers = useCallback(() => {
    citationNavigationTimerRefs.current.forEach(timer => {
      window.clearTimeout(timer);
    });
    citationNavigationTimerRefs.current = [];
  }, []);

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
    [zoomCapability]
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
  const [activeNoteAnnotationId, setActiveNoteAnnotationId] = useState<string | null>(null);
  const [noteEditorValue, setNoteEditorValue] = useState<Descendant[]>(createEmptyNoteValue());
  const [noteSaving, setNoteSaving] = useState(false);

  const annotationIdToRecordId = useMemo(() => {
    const map = new Map<string, number>();
    annotations.forEach(entry => {
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
        lines => {
          const normalized = lines
            .map(line => line.trim())
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
          latestSelectionTextRef.current = normalized || null;
          setSelectedTextForAskAI(normalized || "");
        },
        () => {
          latestSelectionTextRef.current = null;
          setSelectedTextForAskAI("");
        }
      );
    } catch {
      latestSelectionTextRef.current = null;
      setSelectedTextForAskAI("");
    }
  }, [selectionCapability]);

  useEffect(() => {
    if (!selectionCapability) return;
    const unsubscribe = selectionCapability.onSelectionChange(range => {
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
          setSelectedTextForAskAI("");
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
    (annotation: PdfAnnotationObject, eventType: AnnotationEvent["type"]): PdfAnnotationObject => {
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
    []
  );

  useEffect(() => {
    importedAnnotationIdsRef.current = new Set();
  }, [pdf.id]);

  useEffect(() => {
    setSearchQuery("");
    setSearchResultQuery("");
    setSearchResults([]);
    setSelectedSearchResultKey(null);
    setIndexStatus(null);
    setSelectedTextForAskAI("");
    setActiveTab("outline");
  }, [pdf.id]);

  useEffect(() => {
    if (!mainDbName) {
      return;
    }
    let cancelled = false;

    const loadStatus = async () => {
      try {
        const status = await getPdfIndexStatus({ pdfId: pdf.id, mainDbName });
        if (!cancelled) {
          setIndexStatus(status);
        }
      } catch (error) {
        if (!cancelled) {
          setIndexStatus({
            pdfId: pdf.id,
            state: "failed",
            pageCount: 0,
            updatedAt: Date.now(),
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    };

    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, [mainDbName, pdf.id]);

  useEffect(() => {
    if (!mainDbName || !resolvedPath || !pluginsReady) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void ensurePdfIndex({
        pdfId: pdf.id,
        resolvedPath,
        fileName: pdf.fileName,
        mainDbName,
      })
        .then(status => {
          if (!cancelled) {
            setIndexStatus(status);
          }
        })
        .catch(error => {
          if (!cancelled) {
            console.error("自动准备 PDF 索引失败", error);
            setIndexStatus({
              pdfId: pdf.id,
              state: "failed",
              pageCount: 0,
              updatedAt: Date.now(),
              error: error instanceof Error ? error.message : String(error),
            });
          }
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mainDbName, pdf.fileName, pdf.id, pluginsReady, resolvedPath]);

  useEffect(() => {
    if (!mainDbName || indexStatus?.state !== "building") {
      return;
    }
    const timer = window.setInterval(async () => {
      try {
        const status = await getPdfIndexStatus({ pdfId: pdf.id, mainDbName });
        setIndexStatus(status);
      } catch (error) {
        console.error("获取 PDF 索引状态失败", error);
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [indexStatus?.state, mainDbName, pdf.id]);

  useEffect(() => {
    if (!annotationCapability || !pluginsReady) return;
    const missing = annotations.filter(entry => {
      const uid = entry.annotation?.id;
      return uid && !importedAnnotationIdsRef.current.has(uid);
    });
    if (!missing.length) return;
    const payload: ImportAnnotationItem[] = missing
      .map(entry => ({ annotation: entry.annotation }))
      .filter((item): item is ImportAnnotationItem => Boolean(item.annotation));
    payload.forEach(item => {
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
      const processedAnnotation = enhanceAnnotationWithSnippet(event.annotation, event.type);
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

      // 文本标记类型标注创建完成后，自动切换回指针模式
      if (
        event.type === "create" &&
        TEXT_MARKUP_SUBTYPES.has(processedAnnotation.type as PdfAnnotationSubtype)
      ) {
        annotationCapability.setActiveTool(null);
      }

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
        result => {
          if (!cancelled) {
            setOutline(result?.bookmarks ?? []);
          }
        },
        error => {
          if (!cancelled) {
            console.error("获取 PDF 目录失败", error);
          }
        }
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
    const unsubscribe = captureCapability.onCaptureArea(async event => {
      // 上传截图并创建区域标注
      try {
        const file = new File([event.blob], `pdf-capture-${Date.now()}.png`, {
          type: "image/png",
        });
        const captureUrl = await uploadResource(file);
        if (captureUrl) {
          // 从 event.rect 获取坐标 (Rect 类型: { origin: Position, size: Size })
          const rect = event.rect;
          const created = await createAreaAnnotation({
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
          if (created) {
            setSelectedAreaAnnotationId(created.id);
          }
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
    [scrollCapability]
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
    [scrollCapability]
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
    [scrollCapability, annotationCapability]
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
    [removeBookmark]
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
        { color }
      );
    },
    [annotationCapability, selectedAnnotationState]
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
        patch as Partial<PdfAnnotationObject>
      );
    },
    [annotationCapability, selectedAnnotationState]
  );

  const handleAnnotationDelete = useCallback(
    (annotationId: string, pageIndex: number) => {
      if (!annotationCapability) return;
      annotationCapability.deleteAnnotation(pageIndex, annotationId);
    },
    [annotationCapability]
  );

  const handleOpenAnnotationNote = useCallback((annotationId?: string) => {
    if (!annotationId) return;
    setActiveNoteAnnotationId(annotationId);
  }, []);

  // 区域标注相关状态和处理函数
  const [selectedAreaAnnotationId, setSelectedAreaAnnotationId] = useState<number | null>(null);

  const handleAreaAnnotationSelect = useCallback((annotation: PdfAnnotation) => {
    setSelectedAreaAnnotationId(annotation.id);
  }, []);

  const handleAreaAnnotationColorChange = useCallback(
    async (annotation: PdfAnnotation, color: EHighlightColor) => {
      await updateAreaAnnotation(annotation.id, { color });
    },
    [updateAreaAnnotation]
  );

  const handleAreaAnnotationAddNote = useCallback((annotation: PdfAnnotation) => {
    if (!annotation.annotation?.id) return;
    setActiveNoteAnnotationId(annotation.annotation.id);
  }, []);

  const handleAreaAnnotationDelete = useCallback(
    async (annotation: PdfAnnotation) => {
      await removeAnnotation(annotation.id);
      setSelectedAreaAnnotationId(null);
    },
    [removeAnnotation]
  );

  const handleSearchSubmit = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query || !mainDbName || !resolvedPath) {
      setSearchResultQuery("");
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    setActiveTab("search");
    try {
      const status = await ensurePdfIndex({
        pdfId: pdf.id,
        resolvedPath,
        fileName: pdf.fileName,
        mainDbName,
      });
      setIndexStatus(status);
      if (status.state === "failed") {
        setSearchResults([]);
        return;
      }
      const results = await searchPdfContent({
        pdfId: pdf.id,
        mainDbName,
        query,
        limit: 10,
      });
      setSearchResultQuery(query);
      setSearchResults(results);
      setSelectedSearchResultKey(null);
      if (results.length === 0) {
        console.warn("[PdfSearch] 未命中结果", {
          pdfId: pdf.id,
          query,
          pageCount: status.pageCount,
          indexState: status.state,
        });
        message.warning(
          status.pageCount > 0
            ? "未找到相关内容，可尝试更短关键词；如果是扫描版 PDF，当前可能没有可检索文本"
            : "当前 PDF 索引为空，可能没有提取到可搜索文本"
        );
      }
    } catch (error) {
      console.error("搜索 PDF 内容失败", error);
      message.error("搜索 PDF 内容失败");
      setSearchResultQuery("");
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [mainDbName, message, pdf.fileName, pdf.id, resolvedPath, searchQuery]);

  const navigateToCitationTarget = useCallback(
    (target: PdfCitationTarget) => {
      if (!scrollCapability) {
        return;
      }

      clearCitationNavigationTimers();
      clearCitationHighlights();

      scrollCapability.scrollToPage({
        pageNumber: target.pageNumber,
        behavior: "smooth",
      });

      const attemptLocate = () => {
        const pageElement = viewerPanelRef.current?.querySelector<HTMLElement>(
          `[data-page-number="${target.pageNumber}"]`
        );
        if (!pageElement) {
          return false;
        }

        const matchedElements = locateCitationTextInPage(pageElement, target);
        if (matchedElements.length === 0) {
          return false;
        }

        highlightedCitationElementsRef.current = matchedElements;
        matchedElements.forEach(element => {
          element.style.transition = "background-color 0.25s ease, box-shadow 0.25s ease";
          element.style.backgroundColor = "rgba(56, 189, 248, 0.18)";
          element.style.boxShadow = "0 0 0 2px rgba(56, 189, 248, 0.35)";
          element.style.borderRadius = "4px";
        });
        matchedElements[0]?.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });

        const cleanupTimer = window.setTimeout(() => {
          clearCitationHighlights();
        }, 2200);
        citationNavigationTimerRefs.current.push(cleanupTimer);
        return true;
      };

      [180, 420, 780].forEach(delay => {
        const timer = window.setTimeout(() => {
          attemptLocate();
        }, delay);
        citationNavigationTimerRefs.current.push(timer);
      });
    },
    [clearCitationHighlights, clearCitationNavigationTimers, scrollCapability]
  );

  const handleSearchResultSelect = useCallback(
    (result: PdfSearchResult) => {
      setSelectedSearchResultKey(`${result.pageNumber}-${result.chunkIndex}-${result.source}`);
      navigateToCitationTarget(buildSearchNavigationTarget(result, searchResultQuery));
    },
    [navigateToCitationTarget, searchResultQuery]
  );

  useEffect(() => {
    if (!jumpTarget || !scrollCapability) {
      return;
    }
    navigateToCitationTarget(jumpTarget);
    return () => {
      clearCitationNavigationTimers();
    };
  }, [clearCitationNavigationTimers, jumpTarget, navigateToCitationTarget, scrollCapability]);

  useEffect(() => {
    return () => {
      clearCitationNavigationTimers();
      clearCitationHighlights();
    };
  }, [clearCitationHighlights, clearCitationNavigationTimers]);

  const selectedAreaAnnotation = useMemo(
    () =>
      selectedAreaAnnotationId == null
        ? null
        : annotations.find(item => item.id === selectedAreaAnnotationId) || null,
    [annotations, selectedAreaAnnotationId]
  );

  const canAskAI = Boolean(
    onAskAI &&
    (selectedTextForAskAI.trim() ||
      selectedAnnotationState?.annotation.contents?.trim() ||
      selectedAreaAnnotation?.areaData?.captureUrl)
  );

  const handleAskAI = useCallback(() => {
    if (!onAskAI) {
      return;
    }
    if (selectedAreaAnnotation?.areaData?.captureUrl) {
      onAskAI({
        kind: "area",
        pageNumber: (selectedAreaAnnotation.areaData.pageIndex ?? 0) + 1,
        text: selectedAreaAnnotation.annotation.contents || "",
        captureUrl: selectedAreaAnnotation.areaData.captureUrl,
      });
      return;
    }

    if (selectedAnnotationState?.annotation.contents?.trim()) {
      onAskAI({
        kind: "annotation",
        pageNumber: selectedAnnotationState.pageIndex + 1,
        text: selectedAnnotationState.annotation.contents,
      });
      return;
    }

    if (selectedTextForAskAI.trim()) {
      onAskAI({
        kind: "selection",
        pageNumber: scrollState?.currentPage ?? 1,
        text: selectedTextForAskAI.trim(),
      });
    }
  }, [
    onAskAI,
    scrollState?.currentPage,
    selectedAnnotationState,
    selectedAreaAnnotation,
    selectedTextForAskAI,
  ]);

  const handleViewerPointerDown = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const target = event.target as HTMLElement | null;

      // 取消区域标注选中（点击区域标注层或其菜单外部时）
      if (selectedAreaAnnotationId !== null) {
        // 检查是否点击在区域标注层或其悬浮菜单内
        const isInAreaLayer = target?.closest(".pdf-area-annotation-layer");
        const isInAreaMenu = target?.closest(".pdf-area-annotation-menu");
        if (!isInAreaLayer && !isInAreaMenu) {
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
    [annotationCapability, selectedAreaAnnotationId]
  );

  const renderSelectionMenu = useCallback(
    (menuProps: SelectionMenuProps) => (
      <AnnotationSelectionMenu
        {...menuProps}
        onColorChange={handleAnnotationColorChange}
        onStyleChange={handleAnnotationStyleChange}
        onAddNote={() => handleOpenAnnotationNote(menuProps.annotation.object.id)}
        onDelete={() =>
          handleAnnotationDelete(
            menuProps.annotation.object.id,
            menuProps.annotation.object.pageIndex ?? 0
          )
        }
      />
    ),
    [
      handleAnnotationColorChange,
      handleAnnotationStyleChange,
      handleOpenAnnotationNote,
      handleAnnotationDelete,
    ]
  );

  const activeNoteAnnotation = useMemo(() => {
    if (!activeNoteAnnotationId) return null;
    const recordId = annotationIdToRecordId.get(activeNoteAnnotationId);
    if (!recordId) return null;
    return annotations.find(item => item.id === recordId) ?? null;
  }, [activeNoteAnnotationId, annotationIdToRecordId, annotations]);

  useEffect(() => {
    if (!activeNoteAnnotation) {
      setNoteEditorValue(createEmptyNoteValue());
      return;
    }
    const existing = activeNoteAnnotation.notes?.[0]?.note;
    setNoteEditorValue(existing && existing.length ? existing : createEmptyNoteValue());
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
      <PdfEmbedToolbar
        onAddBookmark={handleAddBookmark}
        canAskAI={canAskAI}
        onAskAI={handleAskAI}
      />
      <div className="relative flex min-h-0 flex-1 bg-inherit">
        <ResizableAndHideableSidebar
          className="relative h-full flex-none"
          width={sidebarWidth}
          open={!sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((prev: boolean) => !prev)}
          onWidthChange={width => setSidebarWidth(width)}
          minWidth={320}
          maxWidth={480}
          resizeHandleSide="right"
          sidebarPosition="left"
          disableResize={sidebarCollapsed}
          showInternalExpandButtonWhenClosed
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
            onAnnotationDelete={item => {
              if (!item.annotation?.id) return;
              handleAnnotationDelete(item.annotation.id, item.annotation.pageIndex ?? 0);
              updateAnnotationNotes(item.id, []);
            }}
            onAnnotationClick={handleAnnotationClick}
            onAnnotationEdit={handleAnnotationEdit}
            searchQuery={searchQuery}
            lastSearchQuery={searchResultQuery}
            onSearchQueryChange={setSearchQuery}
            onSearchSubmit={handleSearchSubmit}
            searchResults={searchResults}
            selectedSearchResultKey={selectedSearchResultKey}
            onSearchResultSelect={handleSearchResultSelect}
            searchLoading={searchLoading}
            indexStatus={indexStatus}
          />
        </ResizableAndHideableSidebar>
        <div
          className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-inherit p-6"
          ref={viewerPanelRef}
          onMouseDownCapture={handleViewerPointerDown}
        >
          {!pluginsReady ? (
            <div className="flex h-full w-full items-center justify-center text-gray-400">
              <LoadingOutlined spin />
            </div>
          ) : (
            <GlobalPointerProvider className="flex min-h-0 min-w-0 flex-1 flex-col">
              <Viewport className="min-h-0 min-w-0 flex-1">
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
                        <div
                          className="relative mx-auto my-4 overflow-hidden"
                          style={{ width, height }}
                          data-page-number={pageIndex + 1}
                          draggable={false}
                          onDragStart={e => e.preventDefault()}
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
        <NoteEditPanel
          activeNoteAnnotation={activeNoteAnnotation}
          noteEditorValue={noteEditorValue}
          setNoteEditorValue={setNoteEditorValue}
          noteSaving={noteSaving}
          onClose={handleCloseNotePanel}
          onSubmit={handleSubmitNote}
        />
      ) : null}
    </>
  );
};

export default PdfEmbedViewer;
