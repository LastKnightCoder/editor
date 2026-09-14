import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Z_INDEX } from "../../../router/zIndex";
import { useSheetBackDismiss } from "../../../router/useSheetBackDismiss";
import { createPortal } from "react-dom";
import {
  AudioLines,
  Ban,
  Baseline,
  Bold,
  Camera,
  Check,
  ChevronDown,
  Code,
  FileText,
  Heading,
  Highlighter,
  Image as ImageIcon,
  Images,
  Info,
  Italic,
  Keyboard,
  Link2,
  List,
  ListOrdered,
  MessageSquarePlus,
  Minus,
  Pencil,
  PanelsTopLeft,
  Plus,
  Quote,
  Redo2,
  Sigma,
  SquareCheck,
  SquareCode,
  StickyNote,
  Strikethrough,
  Table as TableIcon,
  Underline,
  Undo2,
  Video,
  Workflow,
} from "lucide-react";

import { calculateFloatingPosition } from "@tau/editor/src/components/HoveringToolbar/floatingPosition";

import ActionSheet, { type ActionSheetItem } from "../../../components/ActionSheet";
import ContentLinkPickerSheet from "../editorExtensions/ContentLinkPickerSheet";
import {
  HIGHLIGHT_OPTIONS,
  TEXT_GRADIENT_OPTIONS,
  TEXT_COLOR_OPTIONS,
  UNDERLINE_COLOR_OPTIONS,
  UNDERLINE_LINE_TYPE_OPTIONS,
  type ToolbarActionId,
  type UnderlineColor,
  type UnderlineLineType,
} from "./toolbarActions";
import type { MobileEditorToolbarController } from "./useMobileEditorToolbarController";

type PaletteActionId = "underline" | "color" | "highlight";

/** 主行按钮 id：格式 action + 三个 UI 触发钮（标题弹条 / 图片直达 / 插入面板） */
export type ToolbarButtonId = ToolbarActionId | "heading" | "image" | "insert";

type MobileEditorBottomToolbarProps = {
  controller: MobileEditorToolbarController;
  /**
   * 浮层挂载点：默认挂到 document.body（浮层型宿主，如 QuickCaptureSheet）。
   * 页面型宿主传入页面根容器，使工具栏随页面转场动画一起平移、退场，
   * 避免返回时工具栏滞留在上一页之上。
   */
  portalContainer?: HTMLElement | null;
  /**
   * 编辑器当前只读（协作会话冻结/结束、跨端降级等）：只读时工具栏不可用且无意义，
   * 强制收起（只读编辑器仍可获得焦点，须显式抑制，不能只依赖 isEditorFocused）。
   */
  readonly?: boolean;
  /**
   * 主行按钮白名单：不传展示全量。传入后仅保留其中的按钮（撤销/重做恒显），
   * 被过滤为空的组连分隔线一起收掉。用于闪卡等轻量编辑场景，
   * 白名单应与宿主场景的渲染能力对齐（能编辑的就能渲染）。
   */
  visibleButtons?: ReadonlySet<ToolbarButtonId> | null;
};

type MenuPosition = {
  left: number;
  top: number;
};

type UnderlinePaletteState = {
  color: UnderlineColor;
  lineType: UnderlineLineType;
};

const GAP = 8;

const DEFAULT_UNDERLINE_PALETTE: UnderlinePaletteState = {
  color: "red",
  lineType: "solid",
};

const PALETTE_ACTION_IDS = new Set<PaletteActionId>(["underline", "color", "highlight"]);

const ACTION_ICONS: Partial<Record<ToolbarButtonId, ReactNode>> = {
  bold: <Bold size={16} strokeWidth={2.5} />,
  italic: <Italic size={16} strokeWidth={2.5} />,
  strikethrough: <Strikethrough size={16} strokeWidth={2.5} />,
  code: <Code size={16} strokeWidth={2.5} />,
  kbd: <Keyboard size={16} strokeWidth={2.5} />,
  underline: <Underline size={16} strokeWidth={2.5} />,
  "styled-text": <Pencil size={16} strokeWidth={2.5} />,
  link: <Link2 size={16} strokeWidth={2.5} />,
  color: <Baseline size={16} strokeWidth={2.5} />,
  highlight: <Highlighter size={16} strokeWidth={2.5} />,
  comment: <MessageSquarePlus size={16} strokeWidth={2.5} />,
  "content-link": <FileText size={16} strokeWidth={2.5} />,
  "bulleted-list": <List size={16} strokeWidth={2.4} />,
  "numbered-list": <ListOrdered size={16} strokeWidth={2.4} />,
  quote: <Quote size={16} strokeWidth={2.4} />,
  divider: <Minus size={16} strokeWidth={2.6} />,
  heading: <Heading size={16} strokeWidth={2.6} />,
  image: <ImageIcon size={16} strokeWidth={2.4} />,
  insert: <Plus size={17} strokeWidth={2.6} />,
};

const ACTION_LABELS: Record<ToolbarButtonId, string> = {
  bold: "加粗",
  italic: "斜体",
  strikethrough: "删除线",
  code: "代码",
  kbd: "快捷键",
  underline: "下划线",
  "styled-text": "样式文本",
  link: "链接",
  color: "颜色",
  highlight: "高亮",
  comment: "批注",
  "content-link": "关联内容",
  "heading-one": "标题一",
  "heading-two": "标题二",
  "heading-three": "标题三",
  "bulleted-list": "无序列表",
  "numbered-list": "有序列表",
  quote: "引用",
  divider: "分割线",
  heading: "标题",
  image: "插入图片",
  insert: "插入",
};

/** 标题弹条选项：用字号递减做层级预览，正文为清除标题 */
const HEADING_PANEL_OPTIONS: Array<{
  value: 1 | 2 | 3 | "paragraph";
  label: string;
  ariaLabel: string;
  textClassName: string;
}> = [
  {
    value: "paragraph",
    label: "正文",
    ariaLabel: "正文",
    textClassName: "text-[13px] font-normal",
  },
  { value: 1, label: "H1", ariaLabel: "标题一", textClassName: "text-[15px] font-bold" },
  { value: 2, label: "H2", ariaLabel: "标题二", textClassName: "text-[14px] font-bold" },
  { value: 3, label: "H3", ariaLabel: "标题三", textClassName: "text-[13px] font-bold" },
];

/** 主行分组：组间竖线分隔，整行横向滚动；插入类操作收口进「+」面板 */
const ROW_GROUPS: ToolbarButtonId[][] = [
  ["bold", "italic", "strikethrough"],
  ["heading", "image", "insert"],
  ["bulleted-list", "numbered-list", "quote"],
  ["underline", "link", "color", "highlight"],
];

function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function isPaletteAction(actionId: ToolbarActionId): actionId is PaletteActionId {
  return PALETTE_ACTION_IDS.has(actionId as PaletteActionId);
}

function readUnderlinePaletteState(): UnderlinePaletteState {
  if (typeof window === "undefined") {
    return DEFAULT_UNDERLINE_PALETTE;
  }
  const storedColor = localStorage.getItem("underline-color");
  const storedLineType = localStorage.getItem("underline-line-type");
  const color = UNDERLINE_COLOR_OPTIONS.some(item => item.value === storedColor)
    ? (storedColor as UnderlineColor)
    : DEFAULT_UNDERLINE_PALETTE.color;
  const lineType = UNDERLINE_LINE_TYPE_OPTIONS.some(item => item.value === storedLineType)
    ? (storedLineType as UnderlineLineType)
    : DEFAULT_UNDERLINE_PALETTE.lineType;
  return { color, lineType };
}

function getViewportSize() {
  const visualViewport = window.visualViewport;
  return {
    width: Math.round(visualViewport?.width ?? window.innerWidth),
    height: Math.round(visualViewport?.height ?? window.innerHeight),
  };
}

/** 悬浮工具条距屏幕底边的间距，与 nav 内联 bottom 的 12px 对应 */
const TOOLBAR_BOTTOM_GAP = 12;
/** 未测量到工具条高度时的兜底值（p-[5px] × 2 + h-9 按钮 = 46px） */
const TOOLBAR_FALLBACK_HEIGHT = 46;

export function MobileEditorBottomToolbar(props: MobileEditorBottomToolbarProps) {
  const { controller, portalContainer, readonly = false, visibleButtons } = props;

  const portalRoot = portalContainer ?? (typeof document === "undefined" ? null : document.body);

  const rowGroups = useMemo(() => {
    if (!visibleButtons) return ROW_GROUPS;
    return ROW_GROUPS.map(group => group.filter(id => visibleButtons.has(id))).filter(
      group => group.length > 0
    );
  }, [visibleButtons]);

  const triggerRefs = useRef<Record<"heading", HTMLButtonElement | null>>({ heading: null });
  const primaryActionRefs = useRef<Partial<Record<PaletteActionId, HTMLButtonElement | null>>>({});
  const groupPanelRef = useRef<HTMLDivElement | null>(null);
  const palettePanelRef = useRef<HTMLDivElement | null>(null);

  const [openGroupId, setOpenGroupId] = useState<"heading" | null>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition>({ left: 0, top: 0 });
  const [palettePosition, setPalettePosition] = useState<MenuPosition>({ left: 0, top: 0 });
  const [underlinePaletteState, setUnderlinePaletteState] = useState<UnderlinePaletteState>(() =>
    readUnderlinePaletteState()
  );

  const showToolbar = !readonly && controller.isEditorFocused;
  const toolbarRef = useRef<HTMLElement | null>(null);

  // 工具条可见时把自身占位高度写到根变量，所在页面的滚动容器据此留白；隐藏时不占位
  useEffect(() => {
    const root = document.documentElement;
    if (!showToolbar) {
      root.style.removeProperty("--mobile-editor-toolbar-occlusion");
      return;
    }
    const height = toolbarRef.current?.offsetHeight || TOOLBAR_FALLBACK_HEIGHT;
    root.style.setProperty("--mobile-editor-toolbar-occlusion", `${height + TOOLBAR_BOTTOM_GAP}px`);
    return () => {
      root.style.removeProperty("--mobile-editor-toolbar-occlusion");
    };
  }, [showToolbar]);

  const preventBlurAndKeepFocus = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      controller.keepEditorFocus();
    },
    [controller]
  );

  const handleHeadingPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      preventBlurAndKeepFocus(event);
      setOpenPaletteId(null);
      setOpenGroupId(prev => (prev === "heading" ? null : "heading"));
    },
    [preventBlurAndKeepFocus]
  );

  const [openPaletteId, setOpenPaletteId] = useState<PaletteActionId | null>(null);

  // 顶部弹条（标题/调色板）的返回手势：先关弹条再弹页面栈；多弹层叠加时 LIFO
  useSheetBackDismiss(openGroupId === "heading", () => setOpenGroupId(null));
  useSheetBackDismiss(openPaletteId !== null, () => setOpenPaletteId(null));

  const handleActionPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, actionId: ToolbarActionId) => {
      preventBlurAndKeepFocus(event);
      if (isPaletteAction(actionId)) {
        if (actionId === "underline") {
          setUnderlinePaletteState(readUnderlinePaletteState());
        }
        setOpenGroupId(null);
        setOpenPaletteId(prev => (prev === actionId ? null : actionId));
        return;
      }
      controller.executeAction(actionId);
      setOpenPaletteId(null);
      setOpenGroupId(null);
    },
    [controller, preventBlurAndKeepFocus]
  );

  const handlePaletteApplyColor = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, color?: string, darkColor?: string) => {
      preventBlurAndKeepFocus(event);
      controller.applyColorMark(color, darkColor);
      setOpenPaletteId(null);
    },
    [controller, preventBlurAndKeepFocus]
  );

  const handlePaletteApplyGradient = useCallback(
    (
      event: ReactPointerEvent<HTMLButtonElement>,
      preset?: (typeof TEXT_GRADIENT_OPTIONS)[number]["preset"]
    ) => {
      preventBlurAndKeepFocus(event);
      controller.applyGradientMark(preset);
      setOpenPaletteId(null);
    },
    [controller, preventBlurAndKeepFocus]
  );

  const handlePaletteApplyHighlight = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, label?: string) => {
      preventBlurAndKeepFocus(event);
      controller.applyHighlightMark(label);
      setOpenPaletteId(null);
    },
    [controller, preventBlurAndKeepFocus]
  );

  const handlePaletteApplyUnderlineColor = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, color: UnderlineColor) => {
      preventBlurAndKeepFocus(event);
      const nextState = { ...underlinePaletteState, color };
      controller.applyUnderlineStyle({ color });
      setUnderlinePaletteState(nextState);
      setOpenPaletteId(null);
    },
    [controller, preventBlurAndKeepFocus, underlinePaletteState]
  );

  const handlePaletteApplyUnderlineLineType = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, lineType: UnderlineLineType) => {
      preventBlurAndKeepFocus(event);
      const nextState = { ...underlinePaletteState, lineType };
      controller.applyUnderlineStyle({ lineType });
      setUnderlinePaletteState(nextState);
      setOpenPaletteId(null);
    },
    [controller, preventBlurAndKeepFocus, underlinePaletteState]
  );

  const updateMenuPosition = useCallback(() => {
    if (!openGroupId) {
      return;
    }
    const triggerEl = triggerRefs.current[openGroupId];
    const panelEl = groupPanelRef.current;
    if (!triggerEl || !panelEl) {
      return;
    }

    const triggerRect = triggerEl.getBoundingClientRect();
    const panelRect = panelEl.getBoundingClientRect();
    const viewport = getViewportSize();

    const nextPosition = calculateFloatingPosition({
      anchorRect: {
        top: triggerRect.top,
        bottom: triggerRect.bottom,
        left: triggerRect.left,
        width: triggerRect.width,
      },
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      floatingWidth: panelRect.width || 220,
      floatingHeight: panelRect.height || 44,
      gap: GAP,
      preferredPlacement: "top",
    });

    setMenuPosition({
      left: nextPosition.left,
      top: nextPosition.top,
    });
  }, [openGroupId]);

  const updatePalettePosition = useCallback(() => {
    if (!openPaletteId) {
      return;
    }
    const triggerEl = primaryActionRefs.current[openPaletteId] ?? null;
    const panelEl = palettePanelRef.current;
    if (!triggerEl || !panelEl) {
      return;
    }

    const triggerRect = triggerEl.getBoundingClientRect();
    const panelRect = panelEl.getBoundingClientRect();
    const viewport = getViewportSize();
    const nextPosition = calculateFloatingPosition({
      anchorRect: {
        top: triggerRect.top,
        bottom: triggerRect.bottom,
        left: triggerRect.left,
        width: triggerRect.width,
      },
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      floatingWidth: panelRect.width || 248,
      floatingHeight: panelRect.height || 120,
      gap: GAP,
      preferredPlacement: "top",
    });

    setPalettePosition({
      left: nextPosition.left,
      top: nextPosition.top,
    });
  }, [openPaletteId]);

  useLayoutEffect(() => {
    if (!openGroupId) return;
    const frame = window.requestAnimationFrame(updateMenuPosition);
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [openGroupId, updateMenuPosition]);

  useLayoutEffect(() => {
    if (!openPaletteId) return;
    const frame = window.requestAnimationFrame(updatePalettePosition);
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [openPaletteId, updatePalettePosition]);

  useEffect(() => {
    if (!openGroupId && !openPaletteId) return;
    const visualViewport = window.visualViewport;
    const handleViewportChange = () => {
      window.requestAnimationFrame(updateMenuPosition);
      window.requestAnimationFrame(updatePalettePosition);
    };

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    visualViewport?.addEventListener("resize", handleViewportChange);
    visualViewport?.addEventListener("scroll", handleViewportChange);

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
      visualViewport?.removeEventListener("resize", handleViewportChange);
      visualViewport?.removeEventListener("scroll", handleViewportChange);
    };
  }, [openGroupId, openPaletteId, updateMenuPosition, updatePalettePosition]);

  useEffect(() => {
    if (!openGroupId && !openPaletteId) return;

    const handleOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (groupPanelRef.current?.contains(target)) return;
      if (palettePanelRef.current?.contains(target)) return;
      const containsTrigger = Object.values(triggerRefs.current).some(trigger =>
        trigger?.contains(target)
      );
      if (containsTrigger) return;
      const containsPaletteTrigger = Object.values(primaryActionRefs.current).some(trigger =>
        trigger?.contains(target)
      );
      if (containsPaletteTrigger) return;
      setOpenGroupId(null);
      setOpenPaletteId(null);
    };

    document.addEventListener("pointerdown", handleOutside);
    return () => {
      document.removeEventListener("pointerdown", handleOutside);
    };
  }, [openGroupId, openPaletteId]);

  useEffect(() => {
    if (controller.isEditorFocused && !readonly) {
      return;
    }
    setOpenGroupId(null);
    setOpenPaletteId(null);
  }, [controller.isEditorFocused, readonly]);

  const headingPanelNode =
    !readonly && controller.isEditorFocused && openGroupId === "heading" && portalRoot
      ? createPortal(
          <div
            ref={groupPanelRef}
            data-testid="mobile-editor-heading-panel"
            className="z-75 bg-elevated/98 border-line shadow-float fixed flex items-center gap-1 rounded-xl border p-1"
            style={{
              left: menuPosition.left,
              top: menuPosition.top,
            }}
          >
            {HEADING_PANEL_OPTIONS.map(option => {
              const active =
                option.value === "paragraph"
                  ? !(
                      controller.isActionActive("heading-one") ||
                      controller.isActionActive("heading-two") ||
                      controller.isActionActive("heading-three")
                    )
                  : controller.isActionActive(
                      option.value === 1
                        ? "heading-one"
                        : option.value === 2
                          ? "heading-two"
                          : "heading-three"
                    );
              return (
                <button
                  key={option.label}
                  type="button"
                  aria-label={option.ariaLabel}
                  className={cn(
                    "text-ink-2 flex h-9 min-w-9 items-center justify-center rounded-lg px-2.5 transition-colors",
                    active ? "bg-accent text-white" : "active:bg-press"
                  )}
                  onPointerDown={event => {
                    preventBlurAndKeepFocus(event);
                    controller.applyHeadingLevel(option.value);
                    setOpenGroupId(null);
                    setOpenPaletteId(null);
                  }}
                >
                  <span className={option.textClassName}>{option.label}</span>
                </button>
              );
            })}
          </div>,
          portalRoot
        )
      : null;

  const paletteNode =
    !readonly && controller.isEditorFocused && openPaletteId && portalRoot
      ? createPortal(
          <div
            ref={palettePanelRef}
            data-testid="mobile-editor-palette"
            data-action={openPaletteId}
            className="z-76 bg-elevated/98 border-line shadow-float fixed min-w-[240px] max-w-[calc(100vw-16px)] rounded-xl border p-2"
            style={{
              left: palettePosition.left,
              top: palettePosition.top,
            }}
          >
            {openPaletteId === "color" ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-ink-3 text-[11px]">纯色</span>
                  <div className="bg-line h-px flex-1" />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {TEXT_COLOR_OPTIONS.map(option => {
                    const previewColor = option.lightColor ?? "transparent";
                    const isDefault =
                      option.lightColor === undefined && option.darkColor === undefined;
                    return (
                      <button
                        key={`color-${option.label}`}
                        type="button"
                        aria-label={`文本颜色 ${option.label}`}
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full border border-transparent",
                          isDefault ? "bg-input text-ink-3" : "text-transparent"
                        )}
                        style={{
                          backgroundColor: isDefault ? undefined : previewColor,
                        }}
                        onPointerDown={event => {
                          handlePaletteApplyColor(event, option.lightColor, option.darkColor);
                        }}
                      >
                        {isDefault ? <Ban size={14} strokeWidth={2.5} /> : null}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-ink-3 text-[11px]">渐变</span>
                  <div className="bg-line h-px flex-1" />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {TEXT_GRADIENT_OPTIONS.map(option => (
                    <button
                      key={`gradient-${option.preset}`}
                      type="button"
                      aria-label={`文本渐变 ${option.label}`}
                      className="border-line flex h-8 w-8 items-center justify-center rounded-full border text-transparent"
                      style={{
                        background: option.previewLight,
                      }}
                      onPointerDown={event => {
                        handlePaletteApplyGradient(event, option.preset);
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : null}
            {openPaletteId === "highlight" ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {HIGHLIGHT_OPTIONS.map(option => {
                  const isDefault = option.value === undefined;
                  return (
                    <button
                      key={`highlight-${option.label}`}
                      type="button"
                      aria-label={`高亮颜色 ${option.label}`}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg border border-transparent",
                        isDefault ? "bg-input text-ink-3" : "text-transparent"
                      )}
                      style={{
                        backgroundColor: isDefault
                          ? undefined
                          : (option.previewColor ?? "transparent"),
                      }}
                      onPointerDown={event => {
                        handlePaletteApplyHighlight(event, option.value);
                      }}
                    >
                      {isDefault ? <Ban size={14} strokeWidth={2.5} /> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {openPaletteId === "underline" ? (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  {UNDERLINE_COLOR_OPTIONS.map(option => {
                    const selected = underlinePaletteState.color === option.value;
                    return (
                      <button
                        key={`underline-color-${option.value}`}
                        type="button"
                        aria-label={`下划线颜色 ${option.label}`}
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-full border",
                          selected ? "border-accent" : "border-transparent"
                        )}
                        style={{ backgroundColor: option.previewColor }}
                        onPointerDown={event => {
                          handlePaletteApplyUnderlineColor(event, option.value);
                        }}
                      >
                        {selected ? (
                          <Check size={12} strokeWidth={3} className="text-white drop-shadow-sm" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {UNDERLINE_LINE_TYPE_OPTIONS.map(option => {
                    const selected = underlinePaletteState.lineType === option.value;
                    return (
                      <button
                        key={`underline-line-${option.value}`}
                        type="button"
                        aria-label={`下划线样式 ${option.label}`}
                        className={cn(
                          "h-7 rounded-md px-2 text-xs font-medium",
                          selected ? "bg-accent text-white" : "bg-input text-ink-2"
                        )}
                        onPointerDown={event => {
                          handlePaletteApplyUnderlineLineType(event, option.value);
                        }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>,
          portalRoot
        )
      : null;

  const toolbarNode =
    showToolbar && portalRoot
      ? createPortal(
          <nav
            ref={toolbarRef}
            data-mobile-editor-toolbar="true"
            className="fixed left-1/2 flex -translate-x-1/2"
            style={{
              zIndex: Z_INDEX.POPOVER,
              // 悬浮胶囊：浮于屏幕底边（或键盘上沿）上方 12px，安全区随底边偏移；
              // 最大宽度走内联样式（Tailwind 任意值里 calc 减法易丢空格导致整条失效）
              bottom: "calc(var(--kb-height, 0px) + 12px + env(safe-area-inset-bottom, 0px))",
              maxWidth: "calc(100vw - 24px)",
            }}
          >
            <div className="border-line bg-elevated/98 shadow-float relative flex max-w-full items-center overflow-hidden rounded-[15px] border">
              <div className="scrollbar-hide flex items-center gap-0.5 overflow-x-auto rounded-[15px] p-[5px]">
                <button
                  type="button"
                  aria-label="撤销"
                  className="text-ink-2 active:bg-press flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] transition-colors"
                  onPointerDown={event => {
                    preventBlurAndKeepFocus(event);
                    controller.undo();
                  }}
                >
                  <Undo2 size={16} strokeWidth={2.4} />
                </button>
                <button
                  type="button"
                  aria-label="重做"
                  className="text-ink-2 active:bg-press flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] transition-colors"
                  onPointerDown={event => {
                    preventBlurAndKeepFocus(event);
                    controller.redo();
                  }}
                >
                  <Redo2 size={16} strokeWidth={2.4} />
                </button>

                {rowGroups.map(group => (
                  <div key={group.join("-")} className="flex shrink-0 items-center gap-0.5">
                    <span aria-hidden="true" className="bg-line mx-1 h-5 w-px shrink-0" />
                    {group.map(buttonId => renderActionButton(buttonId))}
                  </div>
                ))}
              </div>
              {/* 右侧渐隐：提示可横向滚动 */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-[15px]"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, color-mix(in srgb, var(--bg-elevated) 98%, transparent) 65%)",
                }}
              />
            </div>
          </nav>,
          portalRoot
        )
      : null;

  function renderActionButton(buttonId: ToolbarButtonId) {
    if (buttonId === "heading") {
      return (
        <button
          key={buttonId}
          ref={node => {
            triggerRefs.current.heading = node;
          }}
          type="button"
          aria-label={ACTION_LABELS.heading}
          aria-expanded={openGroupId === "heading"}
          className={cn(
            "text-ink-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] transition-colors",
            openGroupId === "heading" ? "bg-press" : "active:bg-press"
          )}
          onPointerDown={handleHeadingPointerDown}
        >
          {ACTION_ICONS.heading}
        </button>
      );
    }
    if (buttonId === "image" || buttonId === "insert") {
      return (
        <button
          key={buttonId}
          type="button"
          aria-label={ACTION_LABELS[buttonId]}
          className="text-ink-2 active:bg-press flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] transition-colors"
          onPointerDown={event => {
            // 仅阻止点击转移焦点（键盘不因触按而收起）；不可调用
            // keepEditorFocus——它的 rAF 兜底会在面板主动 blur 后把焦点抢回，
            // 导致键盘无法让位给面板/系统选择器
            event.preventDefault();
            event.stopPropagation();
            if (buttonId === "image") {
              controller.handleInsertImage();
            } else {
              controller.handleOpenInsertSheet();
            }
          }}
        >
          {ACTION_ICONS[buttonId]}
        </button>
      );
    }

    const actionId: ToolbarActionId = buttonId;
    const active = controller.isActionActive(actionId);
    const disabled = controller.isActionDisabled(actionId);
    return (
      <button
        key={actionId}
        ref={node => {
          if (isPaletteAction(actionId)) {
            primaryActionRefs.current[actionId] = node;
          }
        }}
        type="button"
        aria-label={ACTION_LABELS[actionId]}
        disabled={disabled}
        aria-disabled={disabled}
        className={cn(
          "text-ink-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] transition-colors",
          disabled ? "cursor-not-allowed opacity-45" : null,
          active && !disabled ? "bg-accent text-white" : "active:bg-press"
        )}
        onPointerDown={
          disabled
            ? undefined
            : event => {
                handleActionPointerDown(event, actionId);
              }
        }
      >
        {ACTION_ICONS[actionId]}
      </button>
    );
  }

  /** 插入面板分组（对齐桌面 slash 菜单的移动端子集）：
   *  媒体 / 块结构 / 高级块 / 行内标记；长列表由 ActionSheet 内容区滚动承接 */
  const insertSheetGroups = useMemo<ActionSheetItem[][]>(
    () => [
      [
        {
          label: "照片（相册）",
          icon: <ImageIcon size={19} strokeWidth={2.3} />,
          tone: "apricot",
          onClick: () => controller.handleSelectInsertItem("image"),
        },
        {
          label: "拍照",
          icon: <Camera size={19} strokeWidth={2.3} />,
          tone: "sage",
          onClick: () => controller.handleSelectInsertItem("camera"),
        },
        {
          label: "视频",
          icon: <Video size={19} strokeWidth={2.3} />,
          tone: "sky",
          onClick: () => controller.handleSelectInsertItem("video"),
        },
        {
          label: "音频",
          icon: <AudioLines size={19} strokeWidth={2.3} />,
          tone: "lilac",
          onClick: () => controller.handleSelectInsertItem("audio"),
        },
        {
          label: "网络图片",
          icon: <Link2 size={19} strokeWidth={2.3} />,
          tone: "apricot",
          onClick: () => controller.handleSelectInsertItem("image-url"),
        },
        {
          label: "网络视频",
          icon: <Link2 size={19} strokeWidth={2.3} />,
          tone: "sky",
          onClick: () => controller.handleSelectInsertItem("video-url"),
        },
        {
          label: "网络音频",
          icon: <Link2 size={19} strokeWidth={2.3} />,
          tone: "lilac",
          onClick: () => controller.handleSelectInsertItem("audio-url"),
        },
        {
          label: "图册",
          icon: <Images size={19} strokeWidth={2.3} />,
          tone: "butter",
          onClick: () => controller.handleSelectInsertItem("image-gallery"),
        },
      ],
      [
        {
          label: "表格",
          icon: <TableIcon size={19} strokeWidth={2.3} />,
          tone: "butter",
          onClick: () => controller.handleSelectInsertItem("table"),
        },
        {
          label: "代码块",
          icon: <SquareCode size={19} strokeWidth={2.3} />,
          tone: "lilac",
          onClick: () => controller.handleSelectInsertItem("code-block"),
        },
        {
          label: "任务列表",
          icon: <SquareCheck size={19} strokeWidth={2.3} />,
          tone: "sage",
          onClick: () => controller.handleSelectInsertItem("check-list"),
        },
        {
          label: "标签页",
          icon: <PanelsTopLeft size={19} strokeWidth={2.3} />,
          tone: "sky",
          onClick: () => controller.handleSelectInsertItem("tabs"),
        },
        {
          label: "折叠块",
          icon: <ChevronDown size={19} strokeWidth={2.3} />,
          tone: "butter",
          onClick: () => controller.handleSelectInsertItem("details"),
        },
        {
          label: "高亮块",
          icon: <Highlighter size={19} strokeWidth={2.3} />,
          tone: "rose",
          onClick: () => controller.handleSelectInsertItem("highlight-block"),
        },
        {
          label: "提示块",
          icon: <Info size={19} strokeWidth={2.3} />,
          tone: "sage",
          onClick: () => controller.handleSelectInsertItem("callout"),
        },
        {
          label: "分割线",
          icon: <Minus size={19} strokeWidth={2.3} />,
          onClick: () => controller.handleSelectInsertItem("divider"),
        },
      ],
      [
        {
          label: "公式",
          icon: <Sigma size={19} strokeWidth={2.3} />,
          tone: "lilac",
          onClick: () => controller.handleSelectInsertItem("math"),
        },
        {
          label: "流程图",
          icon: <Workflow size={19} strokeWidth={2.3} />,
          tone: "sky",
          onClick: () => controller.handleSelectInsertItem("mermaid"),
        },
      ],
      [
        {
          label: "批注",
          icon: <MessageSquarePlus size={19} strokeWidth={2.3} />,
          tone: "rose",
          onClick: () => controller.handleSelectInsertItem("comment"),
        },
        {
          label: "注解",
          icon: <StickyNote size={19} strokeWidth={2.3} />,
          tone: "butter",
          onClick: () => controller.handleSelectInsertItem("annotation"),
        },
        {
          label: "关联内容",
          icon: <FileText size={19} strokeWidth={2.3} />,
          tone: "sky",
          onClick: () => controller.handleSelectInsertItem("content-link"),
        },
        {
          label: "样式文本",
          icon: <Pencil size={19} strokeWidth={2.3} />,
          tone: "apricot",
          onClick: () => controller.handleSelectInsertItem("styled-text"),
        },
        {
          label: "快捷键",
          icon: <Keyboard size={19} strokeWidth={2.3} />,
          tone: "rose",
          onClick: () => controller.handleSelectInsertItem("kbd"),
        },
      ],
    ],
    [controller]
  );

  return (
    <>
      {toolbarNode}
      {headingPanelNode}
      {paletteNode}
      <ActionSheet
        open={controller.isInsertSheetOpen}
        title="插入"
        groups={insertSheetGroups}
        onClose={controller.handleCloseInsertSheet}
      />
      <ContentLinkPickerSheet
        open={controller.isContentLinkPickerOpen}
        onClose={controller.handleCloseContentLinkPicker}
        onSelect={controller.handleSelectContentLink}
      />
    </>
  );
}

export default MobileEditorBottomToolbar;
