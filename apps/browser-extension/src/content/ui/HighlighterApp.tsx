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
import {
  getLastSelectedColor,
  getPageHighlights,
  saveLastSelectedColor,
  savePageHighlights,
} from "../storage";
import {
  applyHighlight,
  removeHighlight,
  restoreAllHighlights,
  updateHighlightAppearance,
} from "../highlighter";
import { initSelectionManager, type SelectionInfo } from "../selection-manager";
import { extractSelectionContext } from "../context-extractor";
import FloatingToolbar from "./FloatingToolbar";
import ColorPicker from "./ColorPicker";
import ThoughtInput from "./ThoughtInput";
import AiAskPanel from "./AiAskPanel";
import {
  getColorPickerPosition,
  getToolbarPosition,
  isUsableRect,
  type ToolbarPlacement,
} from "./overlayPosition";
import { buildScopedToolbarDisableKey } from "./toolbarDisableScope";

interface HighlighterAppProps {
  shadowRoot: ShadowRoot;
}

const TOOLBAR_DISABLE_PERMANENT_KEY =
  "tau-highlighter-toolbar-disabled-permanent";
const TOOLBAR_DISABLE_SESSION_KEY = "tau-highlighter-toolbar-disabled-session";
const DEBUG_PREFIX = "[Tau Toolbar Debug]";

function debugLog(message: string, payload?: Record<string, unknown>) {
  if (payload) {
    console.debug(DEBUG_PREFIX, message, payload);
    return;
  }

  console.debug(DEBUG_PREFIX, message);
}
type ChromeStorageWithSession = typeof chrome.storage & {
  session?: chrome.storage.StorageArea;
};

const getSessionStorageArea = () =>
  typeof chrome !== "undefined"
    ? (chrome.storage as ChromeStorageWithSession).session
    : undefined;

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
  const [toolbarPlacement, setToolbarPlacement] =
    useState<ToolbarPlacement>("above");
  const [toolbarAutoDisabled, setToolbarAutoDisabled] = useState(false);
  // 锚点：返回工具栏对齐目标的当前视口矩形
  const toolbarAnchorRef = useRef<(() => DOMRect | null) | null>(null);

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

  // ThoughtInput 统一状态（查看态 + 编辑态）
  const [thoughtVisible, setThoughtVisible] = useState(false);
  const [thoughtMode, setThoughtMode] = useState<"view" | "edit">("edit");
  const [thoughtHighlightId, setThoughtHighlightId] = useState<string | null>(
    null,
  );

  // AI 问书面板状态
  const [aiPanelVisible, setAiPanelVisible] = useState(false);
  const [aiPanelText, setAiPanelText] = useState("");
  const [aiPanelContext, setAiPanelContext] = useState("");

  const url = window.location.href.split("#")[0];
  const permanentDisableKey = buildScopedToolbarDisableKey(
    TOOLBAR_DISABLE_PERMANENT_KEY,
    url,
  );
  const sessionDisableKey = buildScopedToolbarDisableKey(
    TOOLBAR_DISABLE_SESSION_KEY,
    url,
  );

  // Keep ref in sync
  useEffect(() => {
    pageDataRef.current = pageData;
  }, [pageData]);

  useEffect(() => {
    selectionRef.current = selectionInfo;
  }, [selectionInfo]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const color = await getLastSelectedColor();
      if (!cancelled) {
        setSelectedColor(color);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // 初始化悬浮球禁用状态（永久禁用 + 会话禁用）
  useEffect(() => {
    let cancelled = false;

    (async () => {
      let permanentDisabled = false;
      let sessionDisabled = false;

      try {
        if (typeof chrome !== "undefined" && chrome.storage?.local) {
          const result = await chrome.storage.local.get(permanentDisableKey);
          permanentDisabled = Boolean(result[permanentDisableKey]);
        }
      } catch {
        permanentDisabled = false;
      }

      try {
        const sessionStorageArea = getSessionStorageArea();
        if (sessionStorageArea) {
          const result = await sessionStorageArea.get(sessionDisableKey);
          sessionDisabled = Boolean(result[sessionDisableKey]);
        } else {
          sessionDisabled =
            window.sessionStorage.getItem(sessionDisableKey) === "1";
        }
      } catch {
        sessionDisabled =
          window.sessionStorage.getItem(sessionDisableKey) === "1";
      }

      if (!cancelled) {
        setToolbarAutoDisabled(permanentDisabled || sessionDisabled);
        debugLog("加载工具栏禁用状态", {
          scopeKey: {
            permanent: permanentDisableKey,
            session: sessionDisableKey,
          },
          permanentDisabled,
          sessionDisabled,
          autoDisabled: permanentDisabled || sessionDisabled,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [permanentDisableKey, sessionDisableKey]);

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

  const getViewport = useCallback(
    () => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }),
    [],
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
    setThoughtVisible(false);
    setThoughtHighlightId(null);
    setSelectionInfo(null);
    setEditingHighlightId(null);
    editingTextRef.current = "";
    toolbarAnchorRef.current = null;
  }, []);

  const disableToolbarForever = useCallback(async () => {
    setToolbarAutoDisabled(true);
    dismissAll();
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        await chrome.storage.local.set({
          [permanentDisableKey]: true,
        });
      }
    } catch {
      // ignore storage error
    }
  }, [dismissAll, permanentDisableKey]);

  const disableToolbarForSession = useCallback(async () => {
    setToolbarAutoDisabled(true);
    dismissAll();
    try {
      const sessionStorageArea = getSessionStorageArea();
      if (sessionStorageArea) {
        await sessionStorageArea.set({ [sessionDisableKey]: true });
      } else {
        window.sessionStorage.setItem(sessionDisableKey, "1");
      }
    } catch {
      window.sessionStorage.setItem(sessionDisableKey, "1");
    }
  }, [dismissAll, sessionDisableKey]);

  // Selection handler
  const handleSelection = useCallback(
    (info: SelectionInfo | null) => {
      if (toolbarAutoDisabled) {
        debugLog("工具栏已禁用，忽略选区", {
          hasInfo: Boolean(info),
        });
        setToolbarVisible(false);
        setSelectionInfo(null);
        return;
      }

      if (!info) {
        debugLog("收到空选区，尝试隐藏工具栏", {
          colorPickerVisible,
          thoughtVisible,
        });
        // Only dismiss toolbar if color picker or thought input isn't open
        if (!colorPickerVisible && !thoughtVisible) {
          setToolbarVisible(false);
          setSelectionInfo(null);
        }
        return;
      }
      debugLog("收到有效选区", {
        text: info.text,
        rect: {
          left: info.rect.left,
          top: info.rect.top,
          width: info.rect.width,
          height: info.rect.height,
        },
      });
      setSelectionInfo(info);
      // 新选区出现时，退出编辑模式
      setEditingHighlightId(null);
      editingTextRef.current = "";
      setThoughtVisible(false);
      setThoughtHighlightId(null);
      setColorPickerVisible(false);
      if (!isUsableRect(info.rect)) {
        debugLog("选区矩形不可用，取消显示工具栏");
        setToolbarVisible(false);
        toolbarAnchorRef.current = null;
        return;
      }
      // 克隆 Range 作为锚点，滚动时用来重算位置
      const anchorRange = info.range.cloneRange();
      toolbarAnchorRef.current = () => {
        try {
          return anchorRange.getBoundingClientRect();
        } catch {
          return null;
        }
      };
      const nextToolbarPosition = getToolbarPosition(info.rect, getViewport());
      debugLog("显示工具栏", {
        position: nextToolbarPosition,
      });
      setToolbarPos(nextToolbarPosition);
      setToolbarPlacement(nextToolbarPosition.placement);
      setToolbarVisible(true);
    },
    [toolbarAutoDisabled, colorPickerVisible, thoughtVisible, getViewport],
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

      // 以高亮 mark 元素作为锚点，滚动时重算位置
      toolbarAnchorRef.current = () => {
        const mark = document.querySelector(
          `mark[data-tau-highlight-id="${highlightId}"]`,
        );
        return mark?.getBoundingClientRect() ?? null;
      };
      if (!isUsableRect(rect)) {
        debugLog("高亮点击矩形不可用，取消显示编辑工具栏", {
          highlightId,
        });
        dismissAll();
        return;
      }
      // 显示 FloatingToolbar（高亮上方）
      const nextToolbarPosition = getToolbarPosition(rect, getViewport());
      debugLog("点击已有高亮，显示编辑工具栏", {
        highlightId,
        position: nextToolbarPosition,
      });
      setToolbarPos(nextToolbarPosition);
      setToolbarPlacement(nextToolbarPosition.placement);
      setToolbarVisible(true);

      // 自动打开 ColorPicker（Toolbar 再上方）
      const nextColorPickerPosition = getColorPickerPosition(
        nextToolbarPosition,
        getViewport(),
      );
      debugLog("显示颜色面板", {
        position: nextColorPickerPosition,
      });
      setColorPickerPos(nextColorPickerPosition);
      setColorPickerVisible(true);

      // 如有 annotation，用 ThoughtInput 查看态显示（高亮下方）
      const annotation = data?.annotations[highlightId] ?? null;
      if (annotation) {
        setThoughtHighlightId(highlightId);
        setThoughtMode("view");
        setThoughtVisible(true);
      } else {
        setThoughtVisible(false);
        setThoughtHighlightId(null);
      }
    },
    [dismissAll, getViewport],
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

  // 滚动/缩放时，跟随锚点重算工具栏和 ColorPicker 位置
  useEffect(() => {
    if (!toolbarVisible) return;

    let rafId: number | null = null;

    const updatePosition = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const getRect = toolbarAnchorRef.current;
        if (!getRect) return;
        const rect = getRect();
        if (!isUsableRect(rect)) {
          debugLog("滚动/缩放后锚点矩形无效，隐藏工具栏");
          setToolbarVisible(false);
          setColorPickerVisible(false);
          return;
        }
        const nextToolbarPosition = getToolbarPosition(rect, getViewport());
        debugLog("更新工具栏位置", {
          position: nextToolbarPosition,
        });
        setToolbarPos(nextToolbarPosition);
        setToolbarPlacement(nextToolbarPosition.placement);
        if (colorPickerVisible) {
          const nextColorPickerPosition = getColorPickerPosition(
            nextToolbarPosition,
            getViewport(),
          );
          debugLog("更新颜色面板位置", {
            position: nextColorPickerPosition,
          });
          setColorPickerPos(nextColorPickerPosition);
        }
      });
    };

    // capture: true 捕获任意可滚动容器的滚动事件
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [toolbarVisible, colorPickerVisible, getViewport]);

  // Listen for storage changes (cross-tab sync / side panel sync)
  useEffect(() => {
    const handler = (changes: {
      [key: string]: chrome.storage.StorageChange;
    }) => {
      const key = `tau-highlights:${url}`;
      if (changes[key]?.newValue) {
        const newData = changes[key].newValue as PageHighlights;
        const currentData = pageDataRef.current;

        // 检查高亮数组是否发生变化（需要重新渲染 DOM）
        const highlightsChanged =
          !currentData ||
          JSON.stringify(currentData.highlights) !==
            JSON.stringify(newData.highlights);

        // 始终更新 pageData（确保 annotations 等数据保持同步）
        setPageData(newData);

        // 仅当高亮数组发生变化时才重新渲染 DOM
        if (highlightsChanged) {
          const marks = document.querySelectorAll(
            "mark[data-tau-highlight-id]",
          );
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
      }
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, [url]);

  // 监听来自 side panel 的滚动指令
  useEffect(() => {
    const handler = (message: any) => {
      if (message.type === "TAU_SCROLL_TO_HIGHLIGHT" && message.highlightId) {
        const mark = document.querySelector(
          `mark[data-tau-highlight-id="${message.highlightId}"]`,
        );
        if (mark) {
          mark.scrollIntoView({ behavior: "smooth", block: "center" });
          // 闪烁效果：短暂高亮后恢复
          const el = mark as HTMLElement;
          el.style.transition = "outline 0.2s, outline-offset 0.2s";
          el.style.outline = "2px solid rgba(96, 165, 250, 0.8)";
          el.style.outlineOffset = "2px";
          setTimeout(() => {
            el.style.outline = "none";
            el.style.outlineOffset = "0";
            setTimeout(() => {
              el.style.removeProperty("transition");
              el.style.removeProperty("outline");
              el.style.removeProperty("outline-offset");
            }, 200);
          }, 1200);
        }
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

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

      if (editingHighlightId) {
        // 编辑模式：直接应用新样式
        const data = pageDataRef.current;
        const existing = data?.highlights.find(
          (h) => h.id === editingHighlightId,
        );
        if (existing) {
          const updated: Highlight = { ...existing, style };
          updateHighlightAppearance(updated);
          updatePageData((prev) => ({
            ...prev,
            highlights: prev.highlights.map((h) =>
              h.id === editingHighlightId ? { ...h, style } : h,
            ),
          }));
        }
        return;
      }

      // 新建模式：首次点击样式时直接按当前选中色生效
      const info = selectionRef.current;
      if (!info) return;

      const createdHighlightId = createHighlight(
        info.range,
        style,
        selectedColor,
      );
      window.getSelection()?.removeAllRanges();
      selectionRef.current = null;
      setSelectionInfo(null);
      setEditingHighlightId(createdHighlightId);
      editingTextRef.current = info.text;

      if (!isUsableRect(info.rect)) {
        debugLog("创建高亮后矩形无效，直接 dismiss");
        dismissAll();
        return;
      }
      const nextToolbarPosition = getToolbarPosition(info.rect, getViewport());
      debugLog("创建高亮后继续显示工具栏", {
        position: nextToolbarPosition,
      });
      setToolbarPos(nextToolbarPosition);
      setToolbarPlacement(nextToolbarPosition.placement);
      setToolbarVisible(true);
      const nextColorPickerPosition = getColorPickerPosition(
        nextToolbarPosition,
        getViewport(),
      );
      debugLog("创建高亮后显示颜色面板", {
        position: nextColorPickerPosition,
      });
      setColorPickerPos(nextColorPickerPosition);
      setColorPickerVisible(true);

      toolbarAnchorRef.current = () => {
        const mark = document.querySelector(
          `mark[data-tau-highlight-id="${createdHighlightId}"]`,
        );
        return mark?.getBoundingClientRect() ?? null;
      };
    },
    [
      editingHighlightId,
      selectedColor,
      createHighlight,
      updatePageData,
      dismissAll,
      getViewport,
    ],
  );

  const handleColorSelect = useCallback(
    (color: HighlightColor) => {
      setSelectedColor(color);
      void saveLastSelectedColor(color);

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

  // 工具栏"写想法"按钮
  const handleThought = useCallback(() => {
    if (editingHighlightId) {
      // 编辑模式：直接使用已有高亮 ID，打开编辑态
      setThoughtHighlightId(editingHighlightId);
      setThoughtMode("edit");
      setThoughtVisible(true);
      setToolbarVisible(false);
      setColorPickerVisible(false);
      return;
    }

    const info = selectionRef.current;
    if (!info) return;

    // 新建模式：用 dashed 虚线下划线样式创建高亮
    const id = createHighlight(info.range, "dashed", selectedColor);
    window.getSelection()?.removeAllRanges();

    setThoughtHighlightId(id);
    setThoughtMode("edit");
    setThoughtVisible(true);
    setToolbarVisible(false);
    setColorPickerVisible(false);
  }, [createHighlight, selectedColor, editingHighlightId]);

  // ThoughtInput 保存（新建或编辑想法）
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

  // 查看态 -> 编辑态
  const handleThoughtEdit = useCallback(() => {
    setThoughtMode("edit");
  }, []);

  // 查看态删除想法（仅删除 annotation）
  const handleThoughtDelete = useCallback(() => {
    if (!thoughtHighlightId) return;
    updatePageData((prev) => {
      const { [thoughtHighlightId]: _, ...rest } = prev.annotations;
      return { ...prev, annotations: rest };
    });
    setThoughtVisible(false);
    setThoughtHighlightId(null);
  }, [thoughtHighlightId, updatePageData]);

  const handleThoughtClose = useCallback(() => {
    setThoughtVisible(false);
    setThoughtHighlightId(null);
  }, []);

  const handleAskAI = useCallback(() => {
    const info = selectionRef.current;
    const text = info?.text || editingTextRef.current;
    if (!text) return;

    // 提取选中文字的段落上下文
    const context = info?.range ? extractSelectionContext(info.range) : "";

    setAiPanelText(text);
    setAiPanelContext(context);
    setAiPanelVisible(true);
    setToolbarVisible(false);
    setColorPickerVisible(false);
    window.getSelection()?.removeAllRanges();
  }, []);

  // 删除当前编辑的高亮
  const handleEditDelete = useCallback(() => {
    if (editingHighlightId) {
      deleteHighlight(editingHighlightId);
    }
    dismissAll();
  }, [editingHighlightId, deleteHighlight, dismissAll]);

  // 获取当前 thoughtHighlightId 对应的 annotation
  const currentAnnotation = thoughtHighlightId
    ? (pageData?.annotations[thoughtHighlightId] ?? null)
    : null;

  return (
    <>
      <FloatingToolbar
        position={toolbarPos}
        placement={toolbarPlacement}
        visible={toolbarVisible}
        onCopy={handleCopy}
        onHighlight={handleHighlightStyle}
        onThought={handleThought}
        onAskAI={handleAskAI}
        activeStyle={editingHighlightId ? pendingStyle : undefined}
        onDelete={editingHighlightId ? handleEditDelete : undefined}
        onDisableForever={disableToolbarForever}
        onDisableForSession={disableToolbarForSession}
      />
      <ColorPicker
        position={colorPickerPos}
        visible={colorPickerVisible}
        selectedColor={selectedColor}
        onColorSelect={handleColorSelect}
      />
      <ThoughtInput
        mode={thoughtMode}
        visible={thoughtVisible}
        initialText={currentAnnotation?.text ?? ""}
        annotation={currentAnnotation}
        onSubmit={handleThoughtSubmit}
        onEdit={handleThoughtEdit}
        onDelete={handleThoughtDelete}
        onClose={handleThoughtClose}
      />
      <AiAskPanel
        visible={aiPanelVisible}
        selectedText={aiPanelText}
        surroundingContext={aiPanelContext}
        pageUrl={url}
        onClose={() => setAiPanelVisible(false)}
      />
    </>
  );
}
