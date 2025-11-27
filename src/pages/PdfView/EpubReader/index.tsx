import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import classNames from "classnames";
import { Spin, Result, Empty, Slider, Dropdown, App } from "antd";
import type { MenuProps } from "antd";
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
  SaveOutlined,
} from "@ant-design/icons";
import { Descendant } from "slate";
import { v4 as uuidv4 } from "uuid";

import type { Epub, EpubAnnotation, TOCItem, Note, EpubHighlightStyle } from "@/types";
import { EHighlightColor } from "@/types";
import { useEpubFileSource, useEpubAnnotations } from "./hooks";
import useTheme from "@/hooks/useTheme";
import useEpubsStore from "@/stores/useEpubsStore";
import Editor from "@/components/Editor";
import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";

import "./index.less";

// 高亮颜色映射
const HIGHLIGHT_COLORS: Record<EHighlightColor, string> = {
  [EHighlightColor.Red]: "#ff6b6b",
  [EHighlightColor.Yellow]: "#ffd43b",
  [EHighlightColor.Green]: "#69db7c",
  [EHighlightColor.Blue]: "#74c0fc",
  [EHighlightColor.Purple]: "#b197fc",
  [EHighlightColor.Pink]: "#f783ac",
};

const COLOR_OPTIONS: EHighlightColor[] = [
  EHighlightColor.Yellow,
  EHighlightColor.Green,
  EHighlightColor.Blue,
  EHighlightColor.Red,
  EHighlightColor.Purple,
  EHighlightColor.Pink,
];

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
  const updateProgress = useEpubsStore((state) => state.updateProgress);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<any>(null);
  const bookRef = useRef<any>(null);

  // State
  const [isReady, setIsReady] = useState(false);
  const [toc, setToc] = useState<TOCItem[]>([]);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [currentTocItem, setCurrentTocItem] = useState<{ label?: string; href?: string } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem("epub-sidebar-collapsed");
    return saved ? JSON.parse(saved) : false;
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("epub-sidebar-width");
    return saved ? parseInt(saved, 10) : 300;
  });
  const [activeTab, setActiveTab] = useState<"toc" | "annotations">("toc");
  const [selectedText, setSelectedText] = useState<string>("");
  const [selectedCfi, setSelectedCfi] = useState<string>("");
  const [showSelectionMenu, setShowSelectionMenu] = useState(false);
  const [selectionMenuPosition, setSelectionMenuPosition] = useState({ x: 0, y: 0 });
  const [activeNoteAnnotation, setActiveNoteAnnotation] = useState<EpubAnnotation | null>(null);
  const [noteEditorValue, setNoteEditorValue] = useState<Descendant[]>(createEmptyNoteValue());
  const [noteSaving, setNoteSaving] = useState(false);

  // Annotations
  const {
    annotations,
    annotationByCfi,
    createAnnotation,
    updateAnnotationNotes,
    removeAnnotation,
  } = useEpubAnnotations({ epubId: epub.id });

  // Persist sidebar state
  useEffect(() => {
    localStorage.setItem("epub-sidebar-collapsed", JSON.stringify(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem("epub-sidebar-width", sidebarWidth.toString());
  }, [sidebarWidth]);

  // Load foliate-js dynamically and initialize
  useEffect(() => {
    if (!epubFile || !containerRef.current) return;

    let cancelled = false;

    const initReader = async () => {
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

        // Clear container and append view
        if (containerRef.current) {
          containerRef.current.innerHTML = "";
          containerRef.current.appendChild(view);
        }

        // Open the book
        await view.open(book);

        // Apply custom styles
        const customCSS = `
          @namespace epub "http://www.idpf.org/2007/ops";
          html {
            color-scheme: ${isDark ? "dark" : "light"};
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            line-height: 1.6;
          }
          p, li, blockquote, dd {
            line-height: 1.6;
            text-align: justify;
          }
          a:link {
            color: ${isDark ? "#74c0fc" : "#1890ff"};
          }
        `;
        view.renderer?.setStyles?.(customCSS);

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
            return (items as Array<{ label?: string; title?: string; href?: string; cfi?: string; subitems?: unknown[] }>).map((item, index) => ({
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
          const { doc } = e.detail;

          // Handle text selection
          doc.addEventListener("mouseup", (event: MouseEvent) => {
            const selection = doc.getSelection();
            if (selection && !selection.isCollapsed) {
              const text = selection.toString().trim();
              if (text) {
                // Get CFI for selection
                const range = selection.getRangeAt(0);
                const cfi = view.getCFI(e.detail.index, range);
                setSelectedText(text);
                setSelectedCfi(cfi);
                setSelectionMenuPosition({
                  x: event.clientX,
                  y: event.clientY,
                });
                setShowSelectionMenu(true);
              }
            } else {
              setShowSelectionMenu(false);
            }
          });

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
          // Restore annotations for this section
          annotations.forEach((annotation) => {
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
          const existingAnnotation = annotationByCfi.get(annotation.value);
          const color = existingAnnotation?.color
            ? HIGHLIGHT_COLORS[existingAnnotation.color]
            : annotation.color || HIGHLIGHT_COLORS.yellow;
          const style = existingAnnotation?.style || "highlight";

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
          const annotation = annotationByCfi.get(value);
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
      if (viewRef.current) {
        viewRef.current.close?.();
        viewRef.current = null;
      }
      bookRef.current = null;
      setIsReady(false);
    };
  }, [epubFile, isDark]);

  // Re-render annotations when they change
  useEffect(() => {
    if (!viewRef.current || !isReady) return;

    // Force re-render of annotations
    annotations.forEach((annotation) => {
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
  const handleCreateHighlight = useCallback(async (color: EHighlightColor = EHighlightColor.Yellow, style: EpubHighlightStyle = "highlight") => {
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
  }, [selectedCfi, selectedText, currentTocItem, createAnnotation, message]);

  const handleDeleteAnnotation = useCallback(async (annotation: EpubAnnotation) => {
    try {
      await removeAnnotation(annotation.id);
      viewRef.current?.deleteAnnotation({ value: annotation.cfi });
      message.success("已删除标注");
    } catch (err) {
      console.error("Failed to delete annotation:", err);
      message.error("删除标注失败");
    }
  }, [removeAnnotation, message]);

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

  // Selection menu items
  const selectionMenuItems: MenuProps["items"] = useMemo(() => [
    {
      key: "highlight",
      label: "高亮",
      icon: <HighlightOutlined />,
      children: COLOR_OPTIONS.map((color) => ({
        key: `highlight-${color}`,
        label: (
          <div className="flex items-center gap-2">
            <span
              className="w-4 h-4 rounded"
              style={{ backgroundColor: HIGHLIGHT_COLORS[color] }}
            />
            <span>{color}</span>
          </div>
        ),
        onClick: () => handleCreateHighlight(color, "highlight"),
      })),
    },
    {
      key: "underline",
      label: "下划线",
      onClick: () => handleCreateHighlight(EHighlightColor.Yellow, "underline"),
    },
    {
      key: "squiggly",
      label: "波浪线",
      onClick: () => handleCreateHighlight(EHighlightColor.Yellow, "squiggly"),
    },
  ], [handleCreateHighlight]);

  // Render TOC recursively
  const renderTocItems = useCallback((items: TOCItem[], depth = 0) => {
    return items.map((item) => (
      <div key={item.id}>
        <div
          className={classNames(
            "epub-toc-item",
            { "epub-toc-item-active": currentTocItem?.href === item.href }
          )}
          style={{ paddingLeft: 16 + depth * 16 }}
          onClick={() => handleTocSelect(item)}
        >
          {item.label}
        </div>
        {item.subitems && renderTocItems(item.subitems, depth + 1)}
      </div>
    ));
  }, [currentTocItem, handleTocSelect]);

  if (error) {
    return (
      <div className="epub-reader-error">
        <Result
          status="error"
          title="EPUB 加载失败"
          subTitle={error.message}
        />
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
    <div className={classNames("epub-reader", { "epub-reader-dark": isDark })}>
      {/* Toolbar */}
      <div className="epub-reader-toolbar">
        <button
          className="epub-toolbar-btn"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title="目录"
        >
          <MenuOutlined />
        </button>
        <div className="epub-toolbar-title">
          {epub.title || epub.fileName}
        </div>
        <div className="epub-toolbar-progress">
          {Math.round(currentProgress * 100)}%
        </div>
      </div>

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
                className={classNames("epub-sidebar-tab", { active: activeTab === "toc" })}
                onClick={() => setActiveTab("toc")}
              >
                <BookOutlined /> 目录
              </button>
              <button
                className={classNames("epub-sidebar-tab", { active: activeTab === "annotations" })}
                onClick={() => setActiveTab("annotations")}
              >
                <HighlightOutlined /> 标注 ({annotations.length})
              </button>
            </div>
            <div className="epub-sidebar-content">
              {activeTab === "toc" ? (
                <div className="epub-toc">
                  {toc.length > 0 ? (
                    renderTocItems(toc)
                  ) : (
                    <Empty description="暂无目录" />
                  )}
                </div>
              ) : (
                <div className="epub-annotations">
                  {annotations.length > 0 ? (
                    annotations.map((annotation) => (
                      <div
                        key={annotation.id}
                        className="epub-annotation-item"
                        onClick={() => handleAnnotationClick(annotation)}
                      >
                        <div
                          className="epub-annotation-color"
                          style={{ backgroundColor: HIGHLIGHT_COLORS[annotation.color || "yellow"] }}
                        />
                        <div className="epub-annotation-content">
                          <div className="epub-annotation-text">
                            {annotation.text || "无文本"}
                          </div>
                          {annotation.chapterTitle && (
                            <div className="epub-annotation-chapter">
                              {annotation.chapterTitle}
                            </div>
                          )}
                          {annotation.notes?.length > 0 && (
                            <div className="epub-annotation-has-note">
                              📝 有笔记
                            </div>
                          )}
                        </div>
                        <div className="epub-annotation-actions">
                          <button
                            className="epub-annotation-action"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenNote(annotation);
                            }}
                            title="编辑笔记"
                          >
                            <EditOutlined />
                          </button>
                          <button
                            className="epub-annotation-action epub-annotation-action-danger"
                            onClick={(e) => {
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
          <div
            ref={containerRef}
            className="epub-reader-container"
          />

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
        <div className="epub-progress-info">
          {currentTocItem?.label || ""}
        </div>
        <Slider
          className="epub-progress-slider"
          min={0}
          max={1}
          step={0.001}
          value={currentProgress}
          onChange={handleGoToFraction}
          tooltip={{ formatter: (value) => value ? `${Math.round(value * 100)}%` : "0%" }}
        />
      </div>

      {/* Selection menu */}
      {showSelectionMenu && (
        <div
          className="epub-selection-menu"
          style={{
            left: selectionMenuPosition.x,
            top: selectionMenuPosition.y,
          }}
        >
          <Dropdown menu={{ items: selectionMenuItems }} trigger={["click"]} open>
            <div />
          </Dropdown>
          <div className="epub-selection-menu-content">
            {COLOR_OPTIONS.map((color) => (
              <button
                key={color}
                className="epub-color-btn"
                style={{ backgroundColor: HIGHLIGHT_COLORS[color] }}
                onClick={() => handleCreateHighlight(color)}
                title={color}
              />
            ))}
          </div>
        </div>
      )}

      {/* Note editor panel */}
      {activeNoteAnnotation && (
        <div className="epub-note-panel">
          <div className="epub-note-panel-header">
            <h3>编辑笔记</h3>
            <button
              className="epub-note-panel-close"
              onClick={handleCloseNote}
              disabled={noteSaving}
            >
              <CloseOutlined />
            </button>
          </div>
          <div className="epub-note-panel-quote">
            {activeNoteAnnotation.text}
          </div>
          <div className="epub-note-panel-editor">
            <Editor
              key={activeNoteAnnotation.id}
              initValue={noteEditorValue}
              onChange={setNoteEditorValue}
              readonly={false}
              theme={isDark ? "dark" : "light"}
            />
          </div>
          <div className="epub-note-panel-actions">
            <button
              className="epub-note-btn epub-note-btn-cancel"
              onClick={handleCloseNote}
              disabled={noteSaving}
            >
              取消
            </button>
            <button
              className="epub-note-btn epub-note-btn-save"
              onClick={handleSaveNote}
              disabled={noteSaving}
            >
              {noteSaving ? <LoadingOutlined /> : <SaveOutlined />}
              {noteSaving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EpubReader;
