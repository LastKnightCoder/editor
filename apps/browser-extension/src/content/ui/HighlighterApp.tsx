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
import { serializeRange, deserializeRange } from "../serialization";
import { getPageHighlights, savePageHighlights } from "../storage";
import {
  applyHighlight,
  removeHighlight,
  restoreAllHighlights,
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
      setToolbarVisible(false);
      setColorPickerVisible(false);

      const data = pageDataRef.current;
      const annotation = data?.annotations[highlightId] ?? null;
      setActiveHighlightId(highlightId);
      setActiveAnnotation(annotation);
      setPopoverPos({
        x: rect.left + rect.width / 2,
        y: rect.bottom + 8,
      });
      setPopoverVisible(true);
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
        setPageData(newData);
        // Re-render highlights
        const marks = document.querySelectorAll("mark[data-tau-highlight-id]");
        marks.forEach((m) => m.parentNode?.removeChild(m));
        restoreAllHighlights(newData.highlights);
      }
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, [url]);

  // --- Action handlers ---

  const handleCopy = useCallback(() => {
    const info = selectionRef.current;
    if (info) {
      navigator.clipboard.writeText(info.text);
    }
    dismissAll();
    window.getSelection()?.removeAllRanges();
  }, [dismissAll]);

  const handleHighlightStyle = useCallback(
    (style: HighlightStyle) => {
      setPendingStyle(style);
      setEditingHighlightId(null);
      // Show color picker above toolbar
      setColorPickerPos({
        x: toolbarPos.x,
        y: toolbarPos.y - 50,
      });
      setColorPickerVisible(true);
    },
    [toolbarPos],
  );

  const handleColorSelect = useCallback(
    (color: HighlightColor) => {
      setSelectedColor(color);

      if (editingHighlightId) {
        // Editing existing highlight: remove old, re-apply with new color
        const data = pageDataRef.current;
        const existing = data?.highlights.find(
          (h) => h.id === editingHighlightId,
        );
        if (existing) {
          removeHighlight(editingHighlightId);
          const updated: Highlight = {
            ...existing,
            color,
            style: pendingStyle,
          };
          try {
            const restored = deserializeRange(existing.range);
            if (restored) {
              applyHighlight(updated, restored);
            }
          } catch {
            /* ignore */
          }
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
    const info = selectionRef.current;
    if (!info) return;

    // Apply default highlight first
    const id = createHighlight(info.range, DEFAULT_STYLE, selectedColor);
    window.getSelection()?.removeAllRanges();

    setThoughtHighlightId(id);
    setThoughtVisible(true);
    setToolbarVisible(false);
    setColorPickerVisible(false);
  }, [createHighlight, selectedColor]);

  const handleThoughtSubmit = useCallback(
    (text: string) => {
      if (!thoughtHighlightId) return;
      const annotation: Annotation = {
        highlightId: thoughtHighlightId,
        text,
        isPublic: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      updatePageData((prev) => ({
        ...prev,
        annotations: { ...prev.annotations, [thoughtHighlightId]: annotation },
      }));
      setThoughtVisible(false);
      setThoughtHighlightId(null);
    },
    [thoughtHighlightId, updatePageData],
  );

  const handleThoughtClose = useCallback(() => {
    setThoughtVisible(false);
    setThoughtHighlightId(null);
  }, []);

  const handleAskAI = useCallback(() => {
    const info = selectionRef.current;
    if (!info) return;
    chrome.runtime.sendMessage({
      type: "TAU_ASK_AI",
      text: info.text,
      url,
    });
    dismissAll();
    window.getSelection()?.removeAllRanges();
  }, [url, dismissAll]);

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
