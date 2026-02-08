import { useState, useEffect, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import type {
  Highlight,
  Annotation,
  PageHighlights,
  HighlightStyle,
  HighlightColor,
} from "../types";
import { DEFAULT_COLOR, DEFAULT_STYLE } from "../types";
import { serializeRange } from "../serialization";
import { getPageHighlights, savePageHighlights } from "../storage";
import {
  applyHighlight,
  removeHighlight,
  restoreAllHighlights,
  updateHighlightAppearance,
} from "../highlighter";
import { initSelectionManager, type SelectionInfo } from "../selection-manager";
import FloatingToolbar from "./FloatingToolbar";
import ColorPicker from "./ColorPicker";
import ThoughtInput from "./ThoughtInput";
import AnnotationPopover from "./AnnotationPopover";

interface HighlighterAppProps {
  shadowRoot: ShadowRoot;
}

export default function HighlighterApp({ shadowRoot }: HighlighterAppProps) {
  // Page data
  const [pageData, setPageData] = useState<PageHighlights | null>(null);
  const pageDataRef = useRef<PageHighlights | null>(null);

  // Selection state
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(
    null,
  );
  const selectionRef = useRef<SelectionInfo | null>(null);

  // 编辑已有高亮时，缓存高亮文本供复制/AI 使用
  const editingTextRef = useRef<string>("");

  // Toolbar state
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [toolbarPos, setToolbarPos] = useState({ x: 0, y: 0 });

  // Color picker state
  const [colorPickerVisible, setColorPickerVisible] = useState(false);
  const [colorPickerPos, setColorPickerPos] = useState({ x: 0, y: 0 });
  const [pendingStyle, setPendingStyle] =
    useState<HighlightStyle>(DEFAULT_STYLE);
  const [selectedColor, setSelectedColor] =
    useState<HighlightColor>(DEFAULT_COLOR);
  const [editingHighlightId, setEditingHighlightId] = useState<string | null>(
    null,
  );

  // Thought input state
  const [thoughtVisible, setThoughtVisible] = useState(false);
  const [thoughtHighlightId, setThoughtHighlightId] = useState<string | null>(
    null,
  );

  // Annotation popover state
  const [popoverVisible, setPopoverVisible] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 });
  const [activeAnnotation, setActiveAnnotation] = useState<Annotation | null>(
    null,
  );
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(
    null,
  );

  const url = window.location.href.split("#")[0];

  // Keep ref in sync
  useEffect(() => {
    pageDataRef.current = pageData;
  }, [pageData]);

  useEffect(() => {
    selectionRef.current = selectionInfo;
  }, [selectionInfo]);

  // Helper to update and persist page data
  const updatePageData = useCallback(
    (updater: (prev: PageHighlights) => PageHighlights) => {
      setPageData((prev) => {
        const base: PageHighlights = prev ?? {
          url,
          highlights: [],
          annotations: {},
          version: 1,
        };
        const next = updater(base);
        savePageHighlights(next);
        return next;
      });
    },
    [url],
  );

  // Create a highlight and persist it
  const createHighlight = useCallback(
    (range: Range, style: HighlightStyle, color: HighlightColor): string => {
      const id = uuidv4();
      const serialized = serializeRange(range);
      const highlight: Highlight = {
        id,
        range: serialized,
        style,
        color,
        createdAt: Date.now(),
      };
      applyHighlight(highlight, range);
      updatePageData((prev) => ({
        ...prev,
        highlights: [...prev.highlights, highlight],
      }));
      return id;
    },
    [updatePageData],
  );

  // Remove a highlight
  const deleteHighlight = useCallback(
    (id: string) => {
      removeHighlight(id);
      updatePageData((prev) => ({
        ...prev,
        highlights: prev.highlights.filter((h) => h.id !== id),
        annotations: (() => {
          const { [id]: _, ...rest } = prev.annotations;
          return rest;
        })(),
      }));
    },
    [updatePageData],
  );

  // Dismiss all UI
  const dismissAll = useCallback(() => {
    setToolbarVisible(false);
    setColorPickerVisible(false);
    setPopoverVisible(false);
    setSelectionInfo(null);
    setEditingHighlightId(null);
    setActiveHighlightId(null);
    setActiveAnnotation(null);
    editingTextRef.current = "";
  }, []);

  // Selection handler
  const handleSelection = useCallback(
    (info: SelectionInfo | null) => {
      if (!info) {
        // Only dismiss toolbar if color picker isn't open
        if (!colorPickerVisible && !thoughtVisible) {
          setToolbarVisible(false);
          setSelectionInfo(null);
        }
        return;
      }
      setSelectionInfo(info);
      // 新选区出现时，退出编辑模式
      setEditingHighlightId(null);
      editingTextRef.current = "";
      setPopoverVisible(false);
      setColorPickerVisible(false);
      setToolbarPos({
        x: info.rect.left + info.rect.width / 2,
        y: info.rect.top - 10,
      });
      setToolbarVisible(true);
    },
    [colorPickerVisible, thoughtVisible],
  );

  // Highlight click handler
  const handleHighlightClick = useCallback(
    (highlightId: string, rect: DOMRect) => {
      if (!highlightId) {
        dismissAll();
        return;
      }

      const data = pageDataRef.current;
      const highlight = data?.highlights.find((h) => h.id === highlightId);
      if (!highlight) {
        dismissAll();
        return;
      }

      // 进入编辑模式：设置当前高亮的样式和颜色
      setEditingHighlightId(highlightId);
      setPendingStyle(highlight.style);
      setSelectedColor(highlight.color);
      editingTextRef.current = highlight.range.text;

      // 显示 FloatingToolbar（高亮上方）
      const toolbarX = rect.left + rect.width / 2;
      const toolbarY = rect.top - 10;
      setToolbarPos({ x: toolbarX, y: toolbarY });
      setToolbarVisible(true);

      // 自动打开 ColorPicker（Toolbar 再上方）
      setColorPickerPos({ x: toolbarX, y: toolbarY - 50 });
      setColorPickerVisible(true);

      // 如有 annotation，同时显示 AnnotationPopover（高亮下方）
      const annotation = data?.annotations[highlightId] ?? null;
      if (annotation) {
        setActiveHighlightId(highlightId);
        setActiveAnnotation(annotation);
        setPopoverPos({
          x: rect.left + rect.width / 2,
          y: rect.bottom + 8,
        });
        setPopoverVisible(true);
      } else {
        setPopoverVisible(false);
        setActiveAnnotation(null);
        setActiveHighlightId(null);
      }
    },
    [dismissAll],
  );

  // Load stored highlights on mount
  useEffect(() => {
    (async () => {
      const data = await getPageHighlights(url);
      if (data) {
        setPageData(data);
        restoreAllHighlights(data.highlights);
      }
    })();
  }, [url]);

  // Init selection manager
  useEffect(() => {
    return initSelectionManager(
      handleSelection,
      handleHighlightClick,
      shadowRoot,
    );
  }, [handleSelection, handleHighlightClick, shadowRoot]);

  // Listen for storage changes (cross-tab sync)
  useEffect(() => {
    const handler = (changes: {
      [key: string]: chrome.storage.StorageChange;
    }) => {
      const key = `tau-highlights:${url}`;
      if (changes[key]?.newValue) {
        const newData = changes[key].newValue as PageHighlights;

        // 跳过当前标签页自己触发的变更（数据已是最新，无需重新渲染 DOM）
        const currentData = pageDataRef.current;
        const isSelfTriggered =
          currentData &&
          JSON.stringify(currentData.highlights) ===
            JSON.stringify(newData.highlights);

        if (isSelfTriggered) {
          return;
        }

        setPageData(newData);
        // Re-render highlights: 先安全解包现有 mark（保留文本节点），再重新应用
        const marks = document.querySelectorAll("mark[data-tau-highlight-id]");
        marks.forEach((mark) => {
          const parent = mark.parentNode;
          if (!parent) return;
          while (mark.firstChild) {
            parent.insertBefore(mark.firstChild, mark);
          }
          parent.removeChild(mark);
          parent.normalize();
        });
        restoreAllHighlights(newData.highlights);
      }
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, [url]);

  // --- Action handlers ---

  const handleCopy = useCallback(() => {
    const info = selectionRef.current;
    const text = info?.text || editingTextRef.current;
    if (text) {
      navigator.clipboard.writeText(text);
    }
    dismissAll();
    window.getSelection()?.removeAllRanges();
  }, [dismissAll]);

  const handleHighlightStyle = useCallback(
    (style: HighlightStyle) => {
      setPendingStyle(style);
      // 编辑模式下保留 editingHighlightId，新建模式下清空
      if (!editingHighlightId) {
        setEditingHighlightId(null);
      }
      // Show color picker above toolbar
      setColorPickerPos({
        x: toolbarPos.x,
        y: toolbarPos.y - 50,
      });
      setColorPickerVisible(true);
    },
    [toolbarPos, editingHighlightId],
  );

  const handleColorSelect = useCallback(
    (color: HighlightColor) => {
      setSelectedColor(color);

      if (editingHighlightId) {
        // 编辑已有高亮：用新样式和颜色重新渲染
        const data = pageDataRef.current;
        const existing = data?.highlights.find(
          (h) => h.id === editingHighlightId,
        );
        if (existing) {
          const updated: Highlight = {
            ...existing,
            color,
            style: pendingStyle,
          };
          updateHighlightAppearance(updated);
          updatePageData((prev) => ({
            ...prev,
            highlights: prev.highlights.map((h) =>
              h.id === editingHighlightId
                ? { ...h, color, style: pendingStyle }
                : h,
            ),
          }));
        }
      } else {
        // New highlight
        const info = selectionRef.current;
        if (info) {
          createHighlight(info.range, pendingStyle, color);
          window.getSelection()?.removeAllRanges();
        }
      }

      setColorPickerVisible(false);
      setToolbarVisible(false);
      setSelectionInfo(null);
      setEditingHighlightId(null);
    },
    [editingHighlightId, pendingStyle, createHighlight, updatePageData],
  );

  const handleColorConfirm = useCallback(() => {
    setColorPickerVisible(false);
    setToolbarVisible(false);
    setEditingHighlightId(null);
  }, []);

  const handleColorDelete = useCallback(() => {
    if (editingHighlightId) {
      deleteHighlight(editingHighlightId);
    }
    dismissAll();
  }, [editingHighlightId, deleteHighlight, dismissAll]);

  const handleThought = useCallback(() => {
    if (editingHighlightId) {
      // 编辑模式：直接使用已有高亮 ID，不新建
      setThoughtHighlightId(editingHighlightId);
      // 如果已有 annotation，预填内容（通过 ThoughtInput 的 initialText）
      setThoughtVisible(true);
      setToolbarVisible(false);
      setColorPickerVisible(false);
      return;
    }

    const info = selectionRef.current;
    if (!info) return;

    // 新建模式：先创建默认高亮
    const id = createHighlight(info.range, DEFAULT_STYLE, selectedColor);
    window.getSelection()?.removeAllRanges();

    setThoughtHighlightId(id);
    setThoughtVisible(true);
    setToolbarVisible(false);
    setColorPickerVisible(false);
  }, [createHighlight, selectedColor, editingHighlightId]);

  const handleThoughtSubmit = useCallback(
    (text: string) => {
      if (!thoughtHighlightId) return;
      updatePageData((prev) => {
        const existing = prev.annotations[thoughtHighlightId];
        if (existing) {
          // 编辑已有想法
          return {
            ...prev,
            annotations: {
              ...prev.annotations,
              [thoughtHighlightId]: {
                ...existing,
                text,
                updatedAt: Date.now(),
              },
            },
          };
        }
        // 新建想法
        const annotation: Annotation = {
          highlightId: thoughtHighlightId,
          text,
          isPublic: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        return {
          ...prev,
          annotations: {
            ...prev.annotations,
            [thoughtHighlightId]: annotation,
          },
        };
      });
      setThoughtVisible(false);
      setThoughtHighlightId(null);
      setEditingHighlightId(null);
    },
    [thoughtHighlightId, updatePageData],
  );

  const handleThoughtClose = useCallback(() => {
    setThoughtVisible(false);
    setThoughtHighlightId(null);
  }, []);

  const handleAskAI = useCallback(() => {
    const info = selectionRef.current;
    const text = info?.text || editingTextRef.current;
    if (!text) return;
    chrome.runtime.sendMessage({
      type: "TAU_ASK_AI",
      text,
      url,
    });
    dismissAll();
    window.getSelection()?.removeAllRanges();
  }, [url, dismissAll]);

  // 删除当前编辑的高亮
  const handleEditDelete = useCallback(() => {
    if (editingHighlightId) {
      deleteHighlight(editingHighlightId);
    }
    dismissAll();
  }, [editingHighlightId, deleteHighlight, dismissAll]);

  // Annotation popover handlers
  const handleAnnotationEdit = useCallback(
    (text: string) => {
      if (!activeHighlightId) return;
      updatePageData((prev) => {
        const existing = prev.annotations[activeHighlightId];
        if (!existing) return prev;
        return {
          ...prev,
          annotations: {
            ...prev.annotations,
            [activeHighlightId]: { ...existing, text, updatedAt: Date.now() },
          },
        };
      });
      setActiveAnnotation((prev) =>
        prev ? { ...prev, text, updatedAt: Date.now() } : prev,
      );
    },
    [activeHighlightId, updatePageData],
  );

  const handleAnnotationDelete = useCallback(() => {
    if (!activeHighlightId) return;
    updatePageData((prev) => {
      const { [activeHighlightId]: _, ...rest } = prev.annotations;
      return { ...prev, annotations: rest };
    });
    setPopoverVisible(false);
    setActiveAnnotation(null);
  }, [activeHighlightId, updatePageData]);

  const handlePopoverClose = useCallback(() => {
    setPopoverVisible(false);
    setActiveAnnotation(null);
    setActiveHighlightId(null);
  }, []);

  return (
    <>
      <FloatingToolbar
        position={toolbarPos}
        visible={toolbarVisible}
        onCopy={handleCopy}
        onHighlight={handleHighlightStyle}
        onThought={handleThought}
        onAskAI={handleAskAI}
        activeStyle={editingHighlightId ? pendingStyle : undefined}
        onDelete={editingHighlightId ? handleEditDelete : undefined}
      />
      <ColorPicker
        position={colorPickerPos}
        visible={colorPickerVisible}
        selectedColor={selectedColor}
        showDelete={!!editingHighlightId}
        onColorSelect={handleColorSelect}
        onConfirm={handleColorConfirm}
        onDelete={handleColorDelete}
      />
      <ThoughtInput
        visible={thoughtVisible}
        initialText={
          thoughtHighlightId
            ? (pageData?.annotations[thoughtHighlightId]?.text ?? "")
            : ""
        }
        onSubmit={handleThoughtSubmit}
        onClose={handleThoughtClose}
      />
      <AnnotationPopover
        annotation={activeAnnotation}
        position={popoverPos}
        visible={popoverVisible}
        onEdit={handleAnnotationEdit}
        onDelete={handleAnnotationDelete}
        onClose={handlePopoverClose}
      />
    </>
  );
}
