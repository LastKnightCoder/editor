import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import classNames from "classnames";
import { Spin, Result, Empty, Slider, App } from "antd";
import {
  LoadingOutlined,
  MenuOutlined,
  LeftOutlined,
  RightOutlined,
  BookOutlined,
  HighlightOutlined,
  EditOutlined,
  DeleteOutlined,
  CloseOutlined,
  SearchOutlined,
  SettingOutlined,
  FontSizeOutlined,
} from "@ant-design/icons";
import {
  LuHighlighter,
  LuUnderline,
  LuWaves,
  LuStickyNote,
  LuTrash2,
  LuChevronDown,
} from "react-icons/lu";
import { Descendant } from "slate";
import { v4 as uuidv4 } from "uuid";

import type { Epub, EpubAnnotation, TOCItem, Note, EpubHighlightStyle } from "@/types";
import { EHighlightColor } from "@/types";
import { useEpubFileSource, useEpubAnnotations } from "./hooks";
import useTheme from "@/hooks/useTheme";
import useEpubsStore from "@/stores/useEpubsStore";
import { Editor } from "@tau/editor/src";
import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";

import "./index.less";

// 高亮颜色映射 - 与 PDF 组件保持一致
const HIGHLIGHT_COLORS: Record<EHighlightColor, string> = {
  [EHighlightColor.Yellow]: "#fde58b",
  [EHighlightColor.Red]: "#ffb3b3",
  [EHighlightColor.Green]: "#b2f1b7",
  [EHighlightColor.Blue]: "#b8d3ff",
  [EHighlightColor.Purple]: "#dcb8ff",
  [EHighlightColor.Pink]: "#ffc4e1",
};

const COLOR_OPTIONS: { id: EHighlightColor; label: string; value: string }[] = [
  { id: EHighlightColor.Yellow, label: "黄色", value: "#fde58b" },
  { id: EHighlightColor.Red, label: "红色", value: "#ffb3b3" },
  { id: EHighlightColor.Green, label: "绿色", value: "#b2f1b7" },
  { id: EHighlightColor.Blue, label: "蓝色", value: "#b8d3ff" },
  { id: EHighlightColor.Purple, label: "紫色", value: "#dcb8ff" },
  { id: EHighlightColor.Pink, label: "粉色", value: "#ffc4e1" },
];

const STYLE_OPTIONS: {
  value: EpubHighlightStyle;
  label: string;
  icon: React.ReactNode;
}[] = [
  { value: "highlight", label: "高亮", icon: <LuHighlighter size={16} /> },
  { value: "underline", label: "下划线", icon: <LuUnderline size={16} /> },
  { value: "squiggly", label: "波浪线", icon: <LuWaves size={16} /> },
];

type ReaderFont = "serif" | "sans" | "humanist";

interface ReaderSettings {
  font: ReaderFont;
  fontSize: number;
  lineHeight: number;
}

type SearchResultItem = {
  id?: string;
  cfi: string;
  excerpt?: {
    pre?: string;
    match?: string;
    post?: string;
  };
  label?: string;
};

const SETTINGS_STORAGE_KEY = "epub-reader-settings";
const DEFAULT_FONT_SIZE = 16;
const DEFAULT_LINE_HEIGHT = 1.6;
const MIN_SEARCH_LENGTH = 1;

const THEME_PRESETS = {
  light: {
    label: "明亮",
    background: "#f7f7f5",
    text: "#1f2329",
    accent: "#4e8df2",
  },
  dark: {
    label: "暗色",
    background: "#0f1116",
    text: "#f5f5f5",
    accent: "#78a0ff",
  },
} as const;

const FONT_STACKS: Record<ReaderFont, string> = {
  serif: `"Georgia", "Times New Roman", "Songti SC", "Noto Serif SC", serif`,
  sans: `-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Helvetica Neue", Arial, sans-serif`,
  humanist: `"LXGW WenKai", "Kaiti SC", "STKaiti", "Noto Serif SC", serif`,
};

const FONT_OPTIONS: { value: ReaderFont; label: string }[] = [
  { value: "serif", label: "衬线" },
  { value: "sans", label: "无衬线" },
  { value: "humanist", label: "楷体风格" },
];

const buildReaderStyles = (
  themeKey: "light" | "dark",
  theme: { background: string; text: string; accent: string },
  fontStack: string,
  fontSize: number,
  lineHeight: number
) => `
  @namespace epub "http://www.idpf.org/2007/ops";
  :root {
    color-scheme: ${themeKey === "dark" ? "dark" : "light"};
    background: ${theme.background};
  }
  body {
    font-family: ${fontStack};
    font-size: ${fontSize}px;
    line-height: ${lineHeight};
    background: ${theme.background};
    color: ${theme.text};
    -webkit-font-smoothing: antialiased;
  }
  p, li, blockquote, dd {
    line-height: ${lineHeight};
    text-align: justify;
  }
  a:link {
    color: ${theme.accent};
  }
  ::selection {
    background: ${theme.accent}30;
  }
  img, svg, video {
    max-width: 100%;
    height: auto;
  }
`;

interface EpubReaderProps {
  epub: Epub;
}

const createEmptyNoteValue = (): Descendant[] => [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

const EpubReader = ({ epub }: EpubReaderProps) => {
  const { status, error, epubFile } = useEpubFileSource(epub);
  const { isDark } = useTheme();
  const { message } = App.useApp();
  const updateProgress = useEpubsStore(state => state.updateProgress);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<any>(null);
  const bookRef = useRef<any>(null);
  const selectionCleanupRef = useRef<Array<() => void>>([]);
  const readerStylesRef = useRef<string>("");
  const searchTaskRef = useRef<{ cancel: () => void } | null>(null);
  const isPointerSelectingRef = useRef(false);

  // State
  const [isReady, setIsReady] = useState(false);
  const [toc, setToc] = useState<TOCItem[]>([]);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [currentTocItem, setCurrentTocItem] = useState<{
    label?: string;
    href?: string;
  } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem("epub-sidebar-collapsed");
    return saved ? JSON.parse(saved) : false;
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("epub-sidebar-width");
    return saved ? parseInt(saved, 10) : 300;
  });
  const [activeTab, setActiveTab] = useState<"toc" | "annotations" | "search">("toc");
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<ReaderSettings>;
        return {
          font: parsed.font || "serif",
          fontSize: parsed.fontSize ? Number(parsed.fontSize) : DEFAULT_FONT_SIZE,
          lineHeight: parsed.lineHeight ? Number(parsed.lineHeight) : DEFAULT_LINE_HEIGHT,
        };
      }
    } catch (err) {
      console.warn("Failed to load EPUB reader settings:", err);
    }
    return {
      font: "serif",
      fontSize: DEFAULT_FONT_SIZE,
      lineHeight: DEFAULT_LINE_HEIGHT,
    };
  });
  const [selectedText, setSelectedText] = useState<string>("");
  const [selectedCfi, setSelectedCfi] = useState<string>("");
  const [showSelectionMenu, setShowSelectionMenu] = useState(false);
  const [selectionMenuPosition, setSelectionMenuPosition] = useState({
    x: 0,
    y: 0,
  });
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [currentColor, setCurrentColor] = useState<EHighlightColor>(EHighlightColor.Yellow);
  const [currentStyle, setCurrentStyle] = useState<EpubHighlightStyle>("highlight");
  const [activeNoteAnnotation, setActiveNoteAnnotation] = useState<EpubAnnotation | null>(null);
  const [noteEditorValue, setNoteEditorValue] = useState<Descendant[]>(createEmptyNoteValue());
  const [noteSaving, setNoteSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState(0);

  const effectiveTheme = useMemo<"light" | "dark">(() => (isDark ? "dark" : "light"), [isDark]);
  const themeConfig = THEME_PRESETS[effectiveTheme];
  const fontStack = useMemo(
    () => FONT_STACKS[readerSettings.font] || FONT_STACKS.serif,
    [readerSettings.font]
  );
  const readerStyleString = useMemo(
    () =>
      buildReaderStyles(
        effectiveTheme,
        themeConfig,
        fontStack,
        readerSettings.fontSize,
        readerSettings.lineHeight
      ),
    [effectiveTheme, themeConfig, fontStack, readerSettings.fontSize, readerSettings.lineHeight]
  );

  const log = useCallback((...args: any[]) => console.log("[EPUB]", ...args), []);

  const hideSelectionMenu = useCallback(() => {
    setShowSelectionMenu(false);
    setShowColorPicker(false);
    setSelectedText("");
    setSelectedCfi("");
  }, []);

  const updateSelectionFromDoc = useCallback(
    (doc: Document, index: number) => {
      if (!viewRef.current) {
        log("viewRef missing, skip selection handling");
        return;
      }
      try {
        const selection = doc.defaultView?.getSelection?.() || doc.getSelection?.();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
          log("selection empty, hide menu");
          hideSelectionMenu();
          return;
        }

        const text = selection.toString().trim();
        if (!text) {
          log("selection text empty, hide menu");
          hideSelectionMenu();
          return;
        }

        const range = selection.getRangeAt(0);
        const cfi = viewRef.current.getCFI(index, range);
        if (!cfi) {
          log("failed to resolve CFI for selection");
          hideSelectionMenu();
          return;
        }

        const rects = range.getClientRects();
        const rect = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
        const frameElement = doc.defaultView?.frameElement as HTMLIFrameElement | null;
        const frameRect = frameElement?.getBoundingClientRect();
        const offsetX = frameRect?.left ?? 0;
        const offsetY = frameRect?.top ?? 0;

        log("selection detected", {
          text,
          cfi,
          rect,
          frameOffset: { x: offsetX, y: offsetY },
          index,
        });

        setSelectedText(text);
        setSelectedCfi(cfi);
        setSelectionMenuPosition({
          x: rect.left + rect.width / 2 + offsetX,
          y: rect.top + offsetY,
        });
        setShowSelectionMenu(true);
        setShowColorPicker(false);
      } catch (err) {
        console.error("Failed to handle EPUB selection:", err);
      }
    },
    [hideSelectionMenu, log]
  );

  const applyReaderStyles = useCallback((styleOverride?: string) => {
    if (!viewRef.current) return;
    const css = styleOverride || readerStylesRef.current;
    if (!css) return;
    viewRef.current.renderer?.setStyles?.(css);
  }, []);

  const attachSelectionListeners = useCallback(
    (doc: Document, index: number) => {
      const handlePointerUp = () => {
        log("pointerup detected", { index });
        setTimeout(() => {
          isPointerSelectingRef.current = false;
          updateSelectionFromDoc(doc, index);
        }, 10);
      };
      const handleMouseUp = () =>
        setTimeout(() => {
          isPointerSelectingRef.current = false;
          updateSelectionFromDoc(doc, index);
        }, 10);
      const handleTouchEnd = () =>
        setTimeout(() => {
          isPointerSelectingRef.current = false;
          updateSelectionFromDoc(doc, index);
        }, 10);
      const handleSelectionChange = () => {
        log("selectionchange event", { index });
        if (isPointerSelectingRef.current) return;
        updateSelectionFromDoc(doc, index);
      };
      const handlePointerDown = () => {
        log("pointerdown, hide menu");
        isPointerSelectingRef.current = true;
        hideSelectionMenu();
      };

      doc.addEventListener("pointerup", handlePointerUp, true);
      doc.addEventListener("mouseup", handleMouseUp, true);
      doc.addEventListener("touchend", handleTouchEnd, true);
      doc.addEventListener("selectionchange", handleSelectionChange, true);
      doc.addEventListener("pointerdown", handlePointerDown, true);

      return () => {
        doc.removeEventListener("pointerup", handlePointerUp, true);
        doc.removeEventListener("mouseup", handleMouseUp, true);
        doc.removeEventListener("touchend", handleTouchEnd, true);
        doc.removeEventListener("selectionchange", handleSelectionChange, true);
        doc.removeEventListener("pointerdown", handlePointerDown, true);
      };
    },
    [hideSelectionMenu, updateSelectionFromDoc, log]
  );

  // Annotations
  const {
    annotations,
    annotationByCfi,
    createAnnotation,
    updateAnnotationNotes,
    removeAnnotation,
  } = useEpubAnnotations({ epubId: epub.id });
  const annotationsRef = useRef(annotations);
  const annotationByCfiRef = useRef(annotationByCfi);

  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  useEffect(() => {
    annotationByCfiRef.current = annotationByCfi;
  }, [annotationByCfi]);

  // Persist sidebar state
  useEffect(() => {
    localStorage.setItem("epub-sidebar-collapsed", JSON.stringify(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem("epub-sidebar-width", sidebarWidth.toString());
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(readerSettings));
  }, [readerSettings]);

  useEffect(() => {
    setSearchResults([]);
    setSearchProgress(0);
    setSearching(false);
    setSearchTerm("");
  }, [epub.id]);

  // Keep reader theme in sync with system theme
  useEffect(() => {
    readerStylesRef.current = readerStyleString;
    log("apply reader styles", {
      theme: effectiveTheme,
      font: readerSettings.font,
      size: readerSettings.fontSize,
    });
    applyReaderStyles(readerStyleString);
  }, [
    readerStyleString,
    applyReaderStyles,
    effectiveTheme,
    readerSettings.font,
    readerSettings.fontSize,
    log,
  ]);

  // Mount log
  useEffect(() => {
    log("component mounted", { epubId: epub.id, status, hasFile: !!epubFile });
    return () => log("component unmounted", { epubId: epub.id });
  }, [epub.id, status, epubFile, log]);

  // Dismiss selection menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't dismiss if clicking inside the floating menu
      if (target.closest(".epub-annotation-floating-menu-wrapper")) return;
      setShowSelectionMenu(false);
      setShowColorPicker(false);
    };

    if (showSelectionMenu) {
      // Add listener with a small delay to avoid immediate dismissal
      const timer = setTimeout(() => {
        window.addEventListener("click", handleClickOutside);
      }, 100);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("click", handleClickOutside);
      };
    }
  }, [showSelectionMenu]);

  // Load foliate-js dynamically and initialize
  useEffect(() => {
    if (!epubFile || !containerRef.current) return;

    let cancelled = false;
    selectionCleanupRef.current.forEach(cleanup => cleanup());
    selectionCleanupRef.current = [];

    const initReader = async () => {
      log("initReader start", { hasFile: !!epubFile, isDark });
      try {
        // Dynamic import of foliate-js modules
        const { makeBook } = await import("foliate-js/view.js");
        const { Overlayer } = await import("foliate-js/overlayer.js");

        if (cancelled) return;

        // Create the book
        const book = await makeBook(epubFile);
        bookRef.current = book;

        if (cancelled) return;

        // Create the view element
        const view = document.createElement("foliate-view") as any;
        viewRef.current = view;
        log("foliate view created");

        // Clear container and append view
        if (containerRef.current) {
          containerRef.current.innerHTML = "";
          containerRef.current.appendChild(view);
        }

        // Open the book
        await view.open(book);
        log("book opened");

        // Apply custom styles
        applyReaderStyles(readerStyleString);

        // Initialize with saved progress
        if (epub.progressCfi) {
          await view.init({ lastLocation: epub.progressCfi });
        } else {
          await view.init({});
        }

        // Extract TOC
        const bookData = book as { toc?: unknown[] };
        if (bookData.toc) {
          const convertToc = (items: unknown[], id = 0): TOCItem[] => {
            return (
              items as Array<{
                label?: string;
                title?: string;
                href?: string;
                cfi?: string;
                subitems?: unknown[];
              }>
            ).map((item, index) => ({
              id: id + index,
              label: item.label || item.title || "Unknown",
              href: item.href || "",
              cfi: item.cfi,
              subitems: item.subitems ? convertToc(item.subitems, (id + index) * 100) : undefined,
            }));
          };
          setToc(convertToc(bookData.toc));
        }

        // Event listeners
        view.addEventListener("relocate", (e: any) => {
          const { fraction, tocItem, cfi } = e.detail;
          setCurrentProgress(fraction || 0);
          setCurrentTocItem(tocItem || null);

          // Save progress
          if (cfi) {
            updateProgress({
              id: epub.id,
              progressCfi: cfi,
              progressPercentage: fraction || 0,
            }).catch(console.error);
          }
        });

        view.addEventListener("load", (e: any) => {
          const { doc, index } = e.detail;
          applyReaderStyles(readerStyleString);
          log("section loaded, attach selection listeners", { index });
          const cleanup = attachSelectionListeners(doc, index);
          selectionCleanupRef.current.push(cleanup);

          // Keyboard navigation
          doc.addEventListener("keydown", (event: KeyboardEvent) => {
            if (event.key === "ArrowLeft" || event.key === "h") {
              view.goLeft();
            } else if (event.key === "ArrowRight" || event.key === "l") {
              view.goRight();
            }
          });
        });

        // Handle overlay creation for annotations
        view.addEventListener("create-overlay", (e: any) => {
          const { index } = e.detail;
          log("create-overlay", { index });
          // Restore annotations for this section
          annotationsRef.current.forEach(annotation => {
            try {
              const resolved = view.resolveCFI(annotation.cfi);
              if (resolved && resolved.index === index) {
                view.addAnnotation({
                  value: annotation.cfi,
                  color: HIGHLIGHT_COLORS[annotation.color || "yellow"],
                });
              }
            } catch (err) {
              // CFI might be invalid, skip
            }
          });
        });

        view.addEventListener("draw-annotation", (e: any) => {
          const { draw, annotation } = e.detail;
          const existingAnnotation = annotationByCfiRef.current.get(annotation.value);
          const color = existingAnnotation?.color
            ? HIGHLIGHT_COLORS[existingAnnotation.color]
            : annotation.color || HIGHLIGHT_COLORS.yellow;
          const style = existingAnnotation?.style || "highlight";

          if (!existingAnnotation) {
            log("draw-annotation for unknown cfi", { value: annotation.value });
          }

          if (style === "underline") {
            draw(Overlayer.underline, { color });
          } else if (style === "squiggly") {
            draw(Overlayer.squiggly, { color });
          } else {
            draw(Overlayer.highlight, { color });
          }
        });

        view.addEventListener("show-annotation", (e: any) => {
          const { value } = e.detail;
          const annotation = annotationByCfiRef.current.get(value);
          if (annotation && annotation.notes?.length) {
            // Show annotation note
            setActiveNoteAnnotation(annotation);
          }
        });

        setIsReady(true);
      } catch (err) {
        console.error("Failed to initialize EPUB reader:", err);
        if (!cancelled) {
          message.error("EPUB 加载失败");
        }
      }
    };

    initReader();

    return () => {
      cancelled = true;
      selectionCleanupRef.current.forEach(cleanup => cleanup());
      selectionCleanupRef.current = [];
      searchTaskRef.current?.cancel?.();
      if (viewRef.current) {
        viewRef.current.close?.();
        viewRef.current = null;
      }
      bookRef.current = null;
      setIsReady(false);
    };
  }, [epubFile, applyReaderStyles, attachSelectionListeners, updateProgress, epub.id, message]);

  // Fallback: attach listeners to currently rendered docs when ready
  useEffect(() => {
    if (!isReady || !viewRef.current) return;
    const contents = viewRef.current.renderer?.getContents?.() || [];
    if (!contents.length) {
      log("no renderer contents found for selection attachment");
      return;
    }
    log("attach selection listeners to renderer contents", {
      count: contents.length,
    });
    selectionCleanupRef.current.forEach(cleanup => cleanup());
    selectionCleanupRef.current = contents.map(({ doc, index }: any) =>
      attachSelectionListeners(doc, index ?? 0)
    );
    return () => {
      selectionCleanupRef.current.forEach(cleanup => cleanup());
      selectionCleanupRef.current = [];
    };
  }, [isReady, attachSelectionListeners, log]);

  // Re-render annotations when they change
  useEffect(() => {
    if (!viewRef.current || !isReady) return;

    // Force re-render of annotations
    annotations.forEach(annotation => {
      try {
        viewRef.current.addAnnotation({
          value: annotation.cfi,
          color: HIGHLIGHT_COLORS[annotation.color || "yellow"],
        });
      } catch (err) {
        // Ignore errors for CFIs not currently visible
      }
    });
  }, [annotations, isReady]);

  // Navigation handlers
  const handlePrev = useCallback(() => {
    viewRef.current?.goLeft();
  }, []);

  const handleNext = useCallback(() => {
    viewRef.current?.goRight();
  }, []);

  const handleGoToFraction = useCallback((fraction: number) => {
    viewRef.current?.goToFraction(fraction);
  }, []);

  const handleTocSelect = useCallback((item: TOCItem) => {
    if (item.href) {
      viewRef.current?.goTo(item.href);
    }
  }, []);

  // Annotation handlers
  const handleCreateHighlight = useCallback(
    async (
      color: EHighlightColor = EHighlightColor.Yellow,
      style: EpubHighlightStyle = "highlight"
    ) => {
      if (!selectedCfi || !selectedText) return;

      try {
        await createAnnotation({
          cfi: selectedCfi,
          text: selectedText,
          color,
          style,
          type: style,
          chapterTitle: currentTocItem?.label,
          chapterHref: currentTocItem?.href,
        });

        // Add visual annotation
        viewRef.current?.addAnnotation({
          value: selectedCfi,
          color: HIGHLIGHT_COLORS[color],
        });

        setShowSelectionMenu(false);
        setSelectedText("");
        setSelectedCfi("");
        message.success("已添加标注");
      } catch (err) {
        console.error("Failed to create highlight:", err);
        message.error("添加标注失败");
      }
    },
    [selectedCfi, selectedText, currentTocItem, createAnnotation, message]
  );

  const handleDeleteAnnotation = useCallback(
    async (annotation: EpubAnnotation) => {
      try {
        await removeAnnotation(annotation.id);
        viewRef.current?.deleteAnnotation({ value: annotation.cfi });
        message.success("已删除标注");
      } catch (err) {
        console.error("Failed to delete annotation:", err);
        message.error("删除标注失败");
      }
    },
    [removeAnnotation, message]
  );

  const handleAnnotationClick = useCallback((annotation: EpubAnnotation) => {
    viewRef.current?.goTo(annotation.cfi);
  }, []);

  const handleOpenNote = useCallback((annotation: EpubAnnotation) => {
    setActiveNoteAnnotation(annotation);
    const existingNote = annotation.notes?.[0]?.note;
    setNoteEditorValue(existingNote?.length ? existingNote : createEmptyNoteValue());
  }, []);

  const handleCloseNote = useCallback(() => {
    if (noteSaving) return;
    setActiveNoteAnnotation(null);
  }, [noteSaving]);

  const handleSaveNote = useCallback(async () => {
    if (!activeNoteAnnotation) return;
    setNoteSaving(true);
    try {
      const baseNote = activeNoteAnnotation.notes?.[0];
      const notePayload: Note = baseNote
        ? { ...baseNote, note: noteEditorValue }
        : { id: uuidv4(), note: noteEditorValue };
      await updateAnnotationNotes(activeNoteAnnotation.id, [notePayload]);
      setActiveNoteAnnotation(null);
      message.success("笔记已保存");
    } catch (err) {
      console.error("Failed to save note:", err);
      message.error("保存笔记失败");
    } finally {
      setNoteSaving(false);
    }
  }, [activeNoteAnnotation, noteEditorValue, updateAnnotationNotes, message]);

  const cancelSearch = useCallback(() => {
    searchTaskRef.current?.cancel?.();
    viewRef.current?.clearSearch?.();
    setSearching(false);
    setSearchProgress(0);
    searchTaskRef.current = null;
  }, []);

  const performSearch = useCallback(
    async (value: string) => {
      const query = value.trim();
      setSearchTerm(value);

      if (!viewRef.current) return;
      if (query.length < MIN_SEARCH_LENGTH) {
        setSearchResults([]);
        cancelSearch();
        return;
      }

      cancelSearch();
      setActiveTab("search");
      setSearching(true);
      setSearchProgress(0);
      setSearchResults([]);

      const view = viewRef.current;
      if (!view?.search) {
        message.error("当前阅读器不支持搜索");
        setSearching(false);
        return;
      }
      let generator: AsyncGenerator<any, any, any> | null = null;
      let cancelled = false;

      const cancel = () => {
        cancelled = true;
        generator?.return?.(undefined);
        view.clearSearch?.();
      };
      searchTaskRef.current = { cancel };

      try {
        generator = await view.search({ query });

        if (!generator) {
          setSearching(false);
          return;
        }

        for await (const result of generator) {
          if (cancelled) break;

          if (typeof result === "string") {
            if (result === "done") {
              setSearching(false);
              setSearchProgress(1);
            }
          } else if ("progress" in result) {
            setSearchProgress(result.progress ?? 0);
          } else if ("subitems" in result) {
            const entries = result.subitems.map((item: any, idx: number) => ({
              id: `${query}-${idx}-${item.cfi}`,
              cfi: item.cfi,
              excerpt: item.excerpt,
              label: result.label,
            }));
            setSearchResults(prev => [...prev, ...entries]);
          } else if ((result as any).cfi) {
            const single = result as any;
            setSearchResults(prev => [
              ...prev,
              {
                id: `${query}-${prev.length}-${single.cfi}`,
                cfi: single.cfi,
                excerpt: single.excerpt,
              },
            ]);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error("EPUB search failed:", err);
          message.error("搜索失败，请重试");
        }
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
        searchTaskRef.current = null;
      }
    },
    [cancelSearch, message]
  );

  const handleSearchResultClick = useCallback(
    (result: SearchResultItem) => {
      viewRef.current?.goTo(result.cfi);
      hideSelectionMenu();
    },
    [hideSelectionMenu]
  );

  const handleFontChange = useCallback((font: ReaderFont) => {
    setReaderSettings(prev => ({ ...prev, font }));
  }, []);

  const handleFontSizeStep = useCallback((delta: number) => {
    setReaderSettings(prev => ({
      ...prev,
      fontSize: Math.min(22, Math.max(12, Math.round(prev.fontSize + delta))),
    }));
  }, []);

  const handleLineHeightChange = useCallback((value: number) => {
    setReaderSettings(prev => ({
      ...prev,
      lineHeight: Math.min(2, Math.max(1.3, parseFloat(value.toFixed(2)))),
    }));
  }, []);

  // Floating toolbar handlers
  const handleColorSelect = useCallback(
    (color: EHighlightColor) => {
      setCurrentColor(color);
      setShowColorPicker(false);
      handleCreateHighlight(color, currentStyle);
    },
    [currentStyle, handleCreateHighlight]
  );

  const handleStyleSelect = useCallback(
    (style: EpubHighlightStyle) => {
      setCurrentStyle(style);
      handleCreateHighlight(currentColor, style);
    },
    [currentColor, handleCreateHighlight]
  );

  const handleAddNoteFromSelection = useCallback(async () => {
    if (!selectedCfi || !selectedText) return;
    // First create the annotation if it doesn't exist
    const existing = annotationByCfi.get(selectedCfi);
    if (existing) {
      handleOpenNote(existing);
    } else {
      // Create annotation first, then open note
      const created = await createAnnotation({
        cfi: selectedCfi,
        text: selectedText,
        color: currentColor,
        style: currentStyle,
        type: currentStyle,
        chapterTitle: currentTocItem?.label,
        chapterHref: currentTocItem?.href,
      });
      if (created) {
        viewRef.current?.addAnnotation({
          value: selectedCfi,
          color: HIGHLIGHT_COLORS[currentColor],
        });
        handleOpenNote(created);
      }
    }
    setShowSelectionMenu(false);
  }, [
    selectedCfi,
    selectedText,
    annotationByCfi,
    currentColor,
    currentStyle,
    currentTocItem,
    createAnnotation,
    handleOpenNote,
  ]);

  const handleDeleteFromSelection = useCallback(async () => {
    const existing = annotationByCfi.get(selectedCfi);
    if (existing) {
      await handleDeleteAnnotation(existing);
    }
    setShowSelectionMenu(false);
  }, [selectedCfi, annotationByCfi, handleDeleteAnnotation]);

  // Render TOC recursively
  const renderTocItems = useCallback(
    (items: TOCItem[], depth = 0) => {
      return items.map(item => (
        <div key={item.id}>
          <div
            className={classNames("epub-toc-item", {
              "epub-toc-item-active": currentTocItem?.href === item.href,
            })}
            style={{ paddingLeft: 16 + depth * 16 }}
            onClick={() => handleTocSelect(item)}
          >
            {item.label}
          </div>
          {item.subitems && renderTocItems(item.subitems, depth + 1)}
        </div>
      ));
    },
    [currentTocItem, handleTocSelect]
  );

  if (error) {
    return (
      <div className="epub-reader-error">
        <Result status="error" title="EPUB 加载失败" subTitle={error.message} />
      </div>
    );
  }

  if (status !== "success" || !epubFile) {
    return (
      <div className="epub-reader-loading">
        <Spin tip="正在加载 EPUB..." indicator={<LoadingOutlined spin />} />
      </div>
    );
  }

  return (
    <div
      className={classNames("epub-reader", {
        "epub-reader-dark": effectiveTheme === "dark",
      })}
    >
      {/* Toolbar */}
      <div className="epub-reader-toolbar">
        <button
          className="epub-toolbar-btn"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title="目录"
        >
          <MenuOutlined />
        </button>
        <div className="epub-toolbar-title">{epub.title || epub.fileName}</div>
        <div className="epub-toolbar-right">
          <div className="epub-toolbar-progress">{Math.round(currentProgress * 100)}%</div>
          <div className="epub-toolbar-actions">
            <button
              className="epub-toolbar-btn"
              onClick={() => setActiveTab("search")}
              title="搜索全文"
            >
              <SearchOutlined />
            </button>
            <button
              className="epub-toolbar-btn"
              onClick={() => handleFontSizeStep(-1)}
              title="减小字号"
            >
              <FontSizeOutlined />
              <span className="epub-toolbar-action-text">-</span>
            </button>
            <button
              className="epub-toolbar-btn"
              onClick={() => handleFontSizeStep(1)}
              title="增大字号"
            >
              <FontSizeOutlined />
              <span className="epub-toolbar-action-text">+</span>
            </button>
            <button
              className={classNames("epub-toolbar-btn", {
                active: showSettingsPanel,
              })}
              onClick={() => setShowSettingsPanel(!showSettingsPanel)}
              title="阅读设置"
            >
              <SettingOutlined />
            </button>
          </div>
        </div>
      </div>

      {showSettingsPanel && (
        <div className="epub-settings-panel">
          <div className="epub-settings-row">
            <div className="epub-settings-label">
              <FontSizeOutlined /> 字体
            </div>
            <div className="epub-settings-options">
              <select
                className="epub-settings-select"
                value={readerSettings.font}
                onChange={e => handleFontChange(e.target.value as ReaderFont)}
              >
                {FONT_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="epub-settings-row">
            <div className="epub-settings-label">字号</div>
            <div className="epub-settings-controls">
              <button className="epub-mini-btn" onClick={() => handleFontSizeStep(-1)}>
                A-
              </button>
              <div className="epub-settings-value">{readerSettings.fontSize}px</div>
              <button className="epub-mini-btn" onClick={() => handleFontSizeStep(1)}>
                A+
              </button>
            </div>
          </div>
          <div className="epub-settings-row">
            <div className="epub-settings-label">行距</div>
            <div className="epub-settings-controls">
              <input
                type="range"
                min={1.3}
                max={2}
                step={0.05}
                value={readerSettings.lineHeight}
                onChange={e => handleLineHeightChange(parseFloat(e.target.value))}
              />
              <div className="epub-settings-value">{readerSettings.lineHeight.toFixed(2)}x</div>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="epub-reader-body">
        {/* Sidebar */}
        <ResizableAndHideableSidebar
          width={sidebarWidth}
          open={!sidebarCollapsed}
          onWidthChange={setSidebarWidth}
          minWidth={240}
          maxWidth={400}
          side="left"
        >
          <div className="epub-sidebar">
            <div className="epub-sidebar-tabs">
              <button
                className={classNames("epub-sidebar-tab", {
                  active: activeTab === "toc",
                })}
                onClick={() => setActiveTab("toc")}
              >
                <BookOutlined /> 目录
              </button>
              <button
                className={classNames("epub-sidebar-tab", {
                  active: activeTab === "annotations",
                })}
                onClick={() => setActiveTab("annotations")}
              >
                <HighlightOutlined /> 标注 ({annotations.length})
              </button>
              <button
                className={classNames("epub-sidebar-tab", {
                  active: activeTab === "search",
                })}
                onClick={() => setActiveTab("search")}
              >
                <SearchOutlined /> 搜索
              </button>
            </div>
            <div className="epub-sidebar-content">
              {activeTab === "toc" && (
                <div className="epub-toc">
                  {toc.length > 0 ? renderTocItems(toc) : <Empty description="暂无目录" />}
                </div>
              )}
              {activeTab === "annotations" && (
                <div className="epub-annotations">
                  {annotations.length > 0 ? (
                    annotations.map(annotation => (
                      <div
                        key={annotation.id}
                        className="epub-annotation-item"
                        onClick={() => handleAnnotationClick(annotation)}
                      >
                        <div
                          className="epub-annotation-color"
                          style={{
                            backgroundColor: HIGHLIGHT_COLORS[annotation.color || "yellow"],
                          }}
                        />
                        <div className="epub-annotation-content">
                          <div className="epub-annotation-text">{annotation.text || "无文本"}</div>
                          {annotation.chapterTitle && (
                            <div className="epub-annotation-chapter">{annotation.chapterTitle}</div>
                          )}
                          {annotation.notes?.length > 0 && (
                            <div className="epub-annotation-has-note">📝 有笔记</div>
                          )}
                        </div>
                        <div className="epub-annotation-actions">
                          <button
                            className="epub-annotation-action"
                            onClick={e => {
                              e.stopPropagation();
                              handleOpenNote(annotation);
                            }}
                            title="编辑笔记"
                          >
                            <EditOutlined />
                          </button>
                          <button
                            className="epub-annotation-action epub-annotation-action-danger"
                            onClick={e => {
                              e.stopPropagation();
                              handleDeleteAnnotation(annotation);
                            }}
                            title="删除"
                          >
                            <DeleteOutlined />
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <Empty description="暂无标注" />
                  )}
                </div>
              )}
              {activeTab === "search" && (
                <div className="epub-search">
                  <div className="epub-search-bar">
                    <div className="epub-search-input">
                      <SearchOutlined />
                      <input
                        value={searchTerm}
                        placeholder="搜索全文..."
                        onChange={e => {
                          const value = e.target.value;
                          setSearchTerm(value);
                          if (!value.trim()) {
                            setSearchResults([]);
                            cancelSearch();
                          }
                        }}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            performSearch(searchTerm);
                          }
                        }}
                      />
                    </div>
                    <button
                      className="epub-search-btn"
                      onClick={() => performSearch(searchTerm)}
                      disabled={searching}
                    >
                      {searching ? <LoadingOutlined spin /> : "搜索"}
                    </button>
                  </div>
                  {(searching || searchProgress > 0) &&
                    searchTerm.trim().length >= MIN_SEARCH_LENGTH && (
                      <div className="epub-search-progress">
                        {searching
                          ? `搜索中 ${Math.round((searchProgress || 0) * 100)}%`
                          : "搜索完成"}
                      </div>
                    )}
                  {searchResults.length > 0 ? (
                    <div className="epub-search-results">
                      {searchResults.map((result, idx) => (
                        <button
                          key={result.id || `${result.cfi}-${idx}`}
                          className="epub-search-result"
                          onClick={() => handleSearchResultClick(result)}
                        >
                          {result.label && (
                            <div className="epub-search-result-label">{result.label}</div>
                          )}
                          {result.excerpt ? (
                            <div className="epub-search-result-excerpt">
                              {result.excerpt.pre && (
                                <span className="epub-search-muted">{result.excerpt.pre}</span>
                              )}
                              {result.excerpt.match && (
                                <span className="epub-search-match">{result.excerpt.match}</span>
                              )}
                              {result.excerpt.post && (
                                <span className="epub-search-muted">{result.excerpt.post}</span>
                              )}
                            </div>
                          ) : (
                            <div className="epub-search-result-excerpt">{result.cfi}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Empty description={searchTerm ? "未找到结果" : "输入关键词搜索"} />
                  )}
                </div>
              )}
            </div>
          </div>
        </ResizableAndHideableSidebar>

        {/* Reader view */}
        <div className="epub-reader-view">
          {/* Navigation buttons */}
          <button className="epub-nav-btn epub-nav-prev" onClick={handlePrev}>
            <LeftOutlined />
          </button>
          <button className="epub-nav-btn epub-nav-next" onClick={handleNext}>
            <RightOutlined />
          </button>

          {/* Foliate view container */}
          <div ref={containerRef} className="epub-reader-container" />

          {/* Loading overlay */}
          {!isReady && (
            <div className="epub-reader-overlay">
              <Spin tip="正在渲染..." indicator={<LoadingOutlined spin />} />
            </div>
          )}
        </div>
      </div>

      {/* Progress slider */}
      <div className="epub-reader-footer">
        <div className="epub-progress-info">{currentTocItem?.label || ""}</div>
        <Slider
          className="epub-progress-slider"
          min={0}
          max={1}
          step={0.001}
          value={currentProgress}
          onChange={handleGoToFraction}
          tooltip={{
            formatter: value => (value ? `${Math.round(value * 100)}%` : "0%"),
          }}
        />
      </div>

      {/* Selection menu - floating toolbar */}
      {showSelectionMenu && (
        <div
          className="epub-annotation-floating-menu-wrapper"
          style={{
            left: selectionMenuPosition.x,
            top: selectionMenuPosition.y,
          }}
        >
          <div className="epub-annotation-floating-menu">
            {/* Color picker popover */}
            {showColorPicker && (
              <div
                className="epub-annotation-color-popover"
                onPointerDown={e => e.stopPropagation()}
              >
                {COLOR_OPTIONS.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    className={classNames("epub-annotation-color-dot", {
                      active: currentColor === option.id,
                    })}
                    style={{ backgroundColor: option.value }}
                    onClick={() => handleColorSelect(option.id)}
                    title={option.label}
                  />
                ))}
              </div>
            )}

            {/* Main toolbar */}
            <div className="epub-annotation-toolbar">
              {/* Color trigger button */}
              <button
                type="button"
                className="epub-annotation-toolbar-btn epub-annotation-color-trigger"
                onClick={() => setShowColorPicker(!showColorPicker)}
                title="选择颜色"
              >
                <span
                  className="epub-annotation-current-color"
                  style={{ backgroundColor: HIGHLIGHT_COLORS[currentColor] }}
                />
                <LuChevronDown size={10} />
              </button>

              <div className="epub-annotation-toolbar-divider" />

              {/* Style buttons */}
              {STYLE_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  className={classNames("epub-annotation-toolbar-btn", {
                    active: currentStyle === option.value,
                  })}
                  onClick={() => handleStyleSelect(option.value)}
                  title={option.label}
                >
                  {option.icon}
                </button>
              ))}

              <div className="epub-annotation-toolbar-divider" />

              {/* Add note button */}
              <button
                type="button"
                className="epub-annotation-toolbar-btn"
                onClick={handleAddNoteFromSelection}
                title="添加笔记"
              >
                <LuStickyNote size={16} />
              </button>

              {/* Delete button (only show if annotation exists) */}
              {annotationByCfi.has(selectedCfi) && (
                <>
                  <div className="epub-annotation-toolbar-divider" />
                  <button
                    type="button"
                    className="epub-annotation-toolbar-btn epub-annotation-toolbar-btn-danger"
                    onClick={handleDeleteFromSelection}
                    title="删除"
                  >
                    <LuTrash2 size={16} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Note editor panel - positioned at bottom center */}
      {activeNoteAnnotation && (
        <div className="epub-annotation-note-panel">
          <div className="epub-annotation-note-panel-header">
            <h3 className="epub-annotation-note-panel-title">编辑笔记</h3>
            <button
              className="epub-annotation-note-panel-close"
              onClick={handleCloseNote}
              disabled={noteSaving}
            >
              <CloseOutlined />
            </button>
          </div>
          {activeNoteAnnotation.text && (
            <div className="epub-annotation-note-panel-quote">{activeNoteAnnotation.text}</div>
          )}
          <div className="epub-annotation-note-panel-editor">
            <Editor
              key={activeNoteAnnotation.id}
              initValue={noteEditorValue}
              onChange={setNoteEditorValue}
              readonly={false}
              theme={effectiveTheme === "dark" ? "dark" : "light"}
            />
          </div>
          <div className="epub-annotation-note-panel-actions">
            <button
              className="epub-note-btn epub-note-btn-ghost"
              onClick={handleCloseNote}
              disabled={noteSaving}
            >
              取消
            </button>
            <button
              className="epub-note-btn epub-note-btn-primary"
              onClick={handleSaveNote}
              disabled={noteSaving}
            >
              {noteSaving && <LoadingOutlined className="epub-note-btn-spinner" />}
              {noteSaving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EpubReader;
