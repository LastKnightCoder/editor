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
import { createPortal } from "react-dom";
import {
  Ban,
  Baseline,
  Bold,
  Check,
  Code,
  Ellipsis,
  FileText,
  Highlighter,
  Italic,
  Keyboard,
  Link2,
  MessageSquarePlus,
  Pencil,
  Strikethrough,
  Type,
  Underline,
} from "lucide-react";

import { calculateFloatingPosition } from "@tau/editor/src/components/HoveringToolbar/floatingPosition";

import ContentLinkPickerSheet from "../editorExtensions/ContentLinkPickerSheet";
import {
  HIGHLIGHT_OPTIONS,
  MORE_ACTIONS,
  PRIMARY_ACTIONS,
  TEXT_STYLE_ACTIONS,
  TEXT_COLOR_OPTIONS,
  UNDERLINE_COLOR_OPTIONS,
  UNDERLINE_LINE_TYPE_OPTIONS,
  type ToolbarActionId,
  type UnderlineColor,
  type UnderlineLineType,
} from "./toolbarActions";
import type { MobileEditorToolbarController } from "./useMobileEditorToolbarController";

type MenuGroupId = "text-style" | "more";
type PaletteActionId = "underline" | "color" | "highlight";

type MobileEditorBottomToolbarProps = {
  controller: MobileEditorToolbarController;
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
const GROUP_BUTTON_WIDTH = 40;
const ACTION_BUTTON_WIDTH = 40;
const WIDTH_BUFFER = 4;

const DEFAULT_UNDERLINE_PALETTE: UnderlinePaletteState = {
  color: "red",
  lineType: "solid",
};

const PALETTE_ACTION_IDS = new Set<PaletteActionId>([
  "underline",
  "color",
  "highlight",
]);

const ACTION_ICONS: Record<ToolbarActionId, ReactNode> = {
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
};

function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function isPaletteAction(
  actionId: ToolbarActionId,
): actionId is PaletteActionId {
  return PALETTE_ACTION_IDS.has(actionId as PaletteActionId);
}

function readUnderlinePaletteState(): UnderlinePaletteState {
  if (typeof window === "undefined") {
    return DEFAULT_UNDERLINE_PALETTE;
  }
  const storedColor = localStorage.getItem("underline-color");
  const storedLineType = localStorage.getItem("underline-line-type");
  const color = UNDERLINE_COLOR_OPTIONS.some(
    (item) => item.value === storedColor,
  )
    ? (storedColor as UnderlineColor)
    : DEFAULT_UNDERLINE_PALETTE.color;
  const lineType = UNDERLINE_LINE_TYPE_OPTIONS.some(
    (item) => item.value === storedLineType,
  )
    ? (storedLineType as UnderlineLineType)
    : DEFAULT_UNDERLINE_PALETTE.lineType;
  return { color, lineType };
}

function calculateVisiblePrimaryCount(
  containerWidth: number,
  totalPrimaryActions: number,
): number {
  const availableWidth = Math.max(0, containerWidth - WIDTH_BUFFER);
  for (let count = totalPrimaryActions; count >= 0; count -= 1) {
    const itemCount = count + 2;
    const totalWidth =
      GROUP_BUTTON_WIDTH * 2 +
      ACTION_BUTTON_WIDTH * count +
      GAP * (itemCount - 1);
    if (totalWidth <= availableWidth) {
      return count;
    }
  }
  return 0;
}

function getViewportSize() {
  const visualViewport = window.visualViewport;
  return {
    width: Math.round(visualViewport?.width ?? window.innerWidth),
    height: Math.round(visualViewport?.height ?? window.innerHeight),
  };
}

export function MobileEditorBottomToolbar(
  props: MobileEditorBottomToolbarProps,
) {
  const { controller } = props;

  const triggerRefs = useRef<Record<MenuGroupId, HTMLButtonElement | null>>({
    "text-style": null,
    more: null,
  });
  const primaryActionRefs = useRef<
    Partial<Record<PaletteActionId, HTMLButtonElement | null>>
  >({});
  const toolbarRowRef = useRef<HTMLDivElement | null>(null);
  const groupPanelRef = useRef<HTMLDivElement | null>(null);
  const palettePanelRef = useRef<HTMLDivElement | null>(null);

  const [openGroupId, setOpenGroupId] = useState<MenuGroupId | null>(null);
  const [openPaletteId, setOpenPaletteId] = useState<PaletteActionId | null>(
    null,
  );
  const [visiblePrimaryCount, setVisiblePrimaryCount] = useState(() => {
    if (typeof window === "undefined") {
      return PRIMARY_ACTIONS.length;
    }
    const fallbackWidth = Math.max(0, window.innerWidth - 48);
    return calculateVisiblePrimaryCount(fallbackWidth, PRIMARY_ACTIONS.length);
  });
  const [menuPosition, setMenuPosition] = useState<MenuPosition>({
    left: 0,
    top: 0,
  });
  const [palettePosition, setPalettePosition] = useState<MenuPosition>({
    left: 0,
    top: 0,
  });
  const [underlinePaletteState, setUnderlinePaletteState] =
    useState<UnderlinePaletteState>(() => readUnderlinePaletteState());

  const visiblePrimaryActions = useMemo(
    () => PRIMARY_ACTIONS.slice(0, visiblePrimaryCount),
    [visiblePrimaryCount],
  );
  const overflowPrimaryActions = useMemo(
    () => PRIMARY_ACTIONS.slice(visiblePrimaryCount),
    [visiblePrimaryCount],
  );
  const moreGroupActions = useMemo(
    () => [...overflowPrimaryActions, ...MORE_ACTIONS],
    [overflowPrimaryActions],
  );

  const activeGroup = useMemo(() => {
    if (!openGroupId) {
      return null;
    }
    if (openGroupId === "text-style") {
      return {
        id: "text-style" as const,
        actions: TEXT_STYLE_ACTIONS,
      };
    }
    return {
      id: "more" as const,
      actions: moreGroupActions,
    };
  }, [moreGroupActions, openGroupId]);

  const preventBlurAndKeepFocus = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      controller.keepEditorFocus();
    },
    [controller],
  );

  const handleGroupPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, groupId: MenuGroupId) => {
      preventBlurAndKeepFocus(event);
      setOpenPaletteId(null);
      setOpenGroupId((prev) => (prev === groupId ? null : groupId));
    },
    [preventBlurAndKeepFocus],
  );

  const handleActionPointerDown = useCallback(
    (
      event: ReactPointerEvent<HTMLButtonElement>,
      actionId: ToolbarActionId,
    ) => {
      preventBlurAndKeepFocus(event);
      if (isPaletteAction(actionId)) {
        if (actionId === "underline") {
          setUnderlinePaletteState(readUnderlinePaletteState());
        }
        setOpenGroupId(null);
        setOpenPaletteId((prev) => (prev === actionId ? null : actionId));
        return;
      }
      controller.executeAction(actionId);
      setOpenPaletteId(null);
      setOpenGroupId(null);
    },
    [controller, preventBlurAndKeepFocus],
  );

  const handlePaletteApplyColor = useCallback(
    (
      event: ReactPointerEvent<HTMLButtonElement>,
      color?: string,
      darkColor?: string,
    ) => {
      preventBlurAndKeepFocus(event);
      controller.applyColorMark(color, darkColor);
      setOpenPaletteId(null);
    },
    [controller, preventBlurAndKeepFocus],
  );

  const handlePaletteApplyHighlight = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, label?: string) => {
      preventBlurAndKeepFocus(event);
      controller.applyHighlightMark(label);
      setOpenPaletteId(null);
    },
    [controller, preventBlurAndKeepFocus],
  );

  const handlePaletteApplyUnderlineColor = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, color: UnderlineColor) => {
      preventBlurAndKeepFocus(event);
      const nextState = {
        ...underlinePaletteState,
        color,
      };
      controller.applyUnderlineStyle({ color });
      setUnderlinePaletteState(nextState);
      setOpenPaletteId(null);
    },
    [controller, preventBlurAndKeepFocus, underlinePaletteState],
  );

  const handlePaletteApplyUnderlineLineType = useCallback(
    (
      event: ReactPointerEvent<HTMLButtonElement>,
      lineType: UnderlineLineType,
    ) => {
      preventBlurAndKeepFocus(event);
      const nextState = {
        ...underlinePaletteState,
        lineType,
      };
      controller.applyUnderlineStyle({ lineType });
      setUnderlinePaletteState(nextState);
      setOpenPaletteId(null);
    },
    [controller, preventBlurAndKeepFocus, underlinePaletteState],
  );

  const recalculateVisibleActions = useCallback(() => {
    const row = toolbarRowRef.current;
    if (!row) {
      return;
    }
    const rowRect = row.getBoundingClientRect();
    const width = Math.round(
      rowRect.width > 0 ? rowRect.width : Math.max(0, window.innerWidth - 48),
    );
    const nextCount = calculateVisiblePrimaryCount(
      width,
      PRIMARY_ACTIONS.length,
    );
    setVisiblePrimaryCount((current) =>
      current === nextCount ? current : nextCount,
    );
  }, []);

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
    const triggerEl =
      primaryActionRefs.current[openPaletteId] ?? triggerRefs.current.more;
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
    if (!controller.isEditorFocused) {
      return;
    }
    const frame = window.requestAnimationFrame(recalculateVisibleActions);
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [controller.isEditorFocused, recalculateVisibleActions]);

  useEffect(() => {
    if (!controller.isEditorFocused) {
      return;
    }
    const row = toolbarRowRef.current;
    if (!row) {
      return;
    }
    const handleResize = () => {
      window.requestAnimationFrame(recalculateVisibleActions);
    };

    window.addEventListener("resize", handleResize);
    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener("resize", handleResize);

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            handleResize();
          })
        : null;
    observer?.observe(row);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", handleResize);
      visualViewport?.removeEventListener("resize", handleResize);
    };
  }, [controller.isEditorFocused, recalculateVisibleActions]);

  useEffect(() => {
    if (!controller.isEditorFocused) {
      return;
    }
    const frame = window.requestAnimationFrame(recalculateVisibleActions);
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [controller.isEditorFocused, recalculateVisibleActions]);

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
      const containsTrigger = Object.values(triggerRefs.current).some(
        (trigger) => trigger?.contains(target),
      );
      if (containsTrigger) return;
      const containsPaletteTrigger = Object.values(
        primaryActionRefs.current,
      ).some((trigger) => trigger?.contains(target));
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
    if (controller.isEditorFocused) {
      return;
    }
    setOpenGroupId(null);
    setOpenPaletteId(null);
  }, [controller.isEditorFocused]);

  const menuNode =
    controller.isEditorFocused && activeGroup && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={groupPanelRef}
            data-testid="mobile-editor-submenu"
            data-group={activeGroup.id}
            className="fixed z-75 flex items-center gap-1 rounded-xl border border-gray-200 bg-white/98 p-1 shadow-[0_12px_28px_rgba(15,23,42,0.18)] dark:border-neutral-700 dark:bg-neutral-950/96"
            style={{
              left: menuPosition.left,
              top: menuPosition.top,
            }}
          >
            {activeGroup.actions.map((action) => {
              const active = controller.isActionActive(action.id);
              const disabled = controller.isActionDisabled(action.id);
              return (
                <button
                  key={action.id}
                  type="button"
                  aria-label={action.label}
                  disabled={disabled}
                  aria-disabled={disabled}
                  className={cn(
                    "flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-gray-600 transition-colors dark:text-neutral-300",
                    disabled
                      ? "cursor-not-allowed bg-gray-100 opacity-45 dark:bg-neutral-800"
                      : null,
                    active && !disabled
                      ? "bg-gray-900 text-white dark:bg-neutral-200 dark:text-neutral-900"
                      : "active:bg-gray-100 dark:active:bg-neutral-800",
                  )}
                  onPointerDown={
                    disabled
                      ? undefined
                      : (event) => {
                          handleActionPointerDown(event, action.id);
                        }
                  }
                >
                  {ACTION_ICONS[action.id]}
                </button>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  const paletteNode =
    controller.isEditorFocused &&
    openPaletteId &&
    typeof document !== "undefined"
      ? createPortal(
          <div
            ref={palettePanelRef}
            data-testid="mobile-editor-palette"
            data-action={openPaletteId}
            className="fixed z-76 min-w-[240px] max-w-[calc(100vw-16px)] rounded-xl border border-gray-200 bg-white/98 p-2 shadow-[0_16px_32px_rgba(15,23,42,0.22)] dark:border-neutral-700 dark:bg-neutral-950/96"
            style={{
              left: palettePosition.left,
              top: palettePosition.top,
            }}
          >
            {openPaletteId === "color" ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {TEXT_COLOR_OPTIONS.map((option) => {
                  const previewColor = option.lightColor ?? "transparent";
                  const isDefault =
                    option.lightColor === undefined &&
                    option.darkColor === undefined;
                  return (
                    <button
                      key={`color-${option.label}`}
                      type="button"
                      aria-label={`文本颜色 ${option.label}`}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full border border-transparent",
                        isDefault
                          ? "bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-300"
                          : "text-transparent",
                      )}
                      style={{
                        backgroundColor: isDefault ? undefined : previewColor,
                      }}
                      onPointerDown={(event) => {
                        handlePaletteApplyColor(
                          event,
                          option.lightColor,
                          option.darkColor,
                        );
                      }}
                    >
                      {isDefault ? <Ban size={14} strokeWidth={2.5} /> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {openPaletteId === "highlight" ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {HIGHLIGHT_OPTIONS.map((option) => {
                  const isDefault = option.value === undefined;
                  return (
                    <button
                      key={`highlight-${option.label}`}
                      type="button"
                      aria-label={`高亮颜色 ${option.label}`}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg border border-transparent",
                        isDefault
                          ? "bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-300"
                          : "text-transparent",
                      )}
                      style={{
                        backgroundColor: isDefault
                          ? undefined
                          : (option.previewColor ?? "transparent"),
                      }}
                      onPointerDown={(event) => {
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
                  {UNDERLINE_COLOR_OPTIONS.map((option) => {
                    const selected =
                      underlinePaletteState.color === option.value;
                    return (
                      <button
                        key={`underline-color-${option.value}`}
                        type="button"
                        aria-label={`下划线颜色 ${option.label}`}
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-full border",
                          selected
                            ? "border-gray-900 dark:border-neutral-100"
                            : "border-transparent",
                        )}
                        style={{ backgroundColor: option.previewColor }}
                        onPointerDown={(event) => {
                          handlePaletteApplyUnderlineColor(event, option.value);
                        }}
                      >
                        {selected ? (
                          <Check
                            size={12}
                            strokeWidth={3}
                            className="text-white drop-shadow-sm"
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {UNDERLINE_LINE_TYPE_OPTIONS.map((option) => {
                    const selected =
                      underlinePaletteState.lineType === option.value;
                    return (
                      <button
                        key={`underline-line-${option.value}`}
                        type="button"
                        aria-label={`下划线样式 ${option.label}`}
                        className={cn(
                          "h-7 rounded-md px-2 text-xs font-medium",
                          selected
                            ? "bg-gray-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                            : "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300",
                        )}
                        onPointerDown={(event) => {
                          handlePaletteApplyUnderlineLineType(
                            event,
                            option.value,
                          );
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
          document.body,
        )
      : null;

  const toolbarNode =
    controller.isEditorFocused && typeof document !== "undefined"
      ? createPortal(
          <nav
            data-mobile-editor-toolbar="true"
            className="fixed inset-x-0 z-70"
            style={{
              bottom: "calc(var(--mobile-safe-bottom) + var(--kb-height, 0px))",
            }}
          >
            <div className="border-t border-gray-200 bg-white/96 px-4 py-2 shadow-[0_-8px_20px_rgba(15,23,42,0.08)] backdrop-blur dark:border-neutral-700 dark:bg-neutral-950/92">
              <div
                ref={toolbarRowRef}
                className="mx-auto flex w-full max-w-[640px] items-center gap-2"
              >
                <button
                  ref={(node) => {
                    triggerRefs.current["text-style"] = node;
                  }}
                  type="button"
                  aria-label="文本样式菜单"
                  aria-expanded={openGroupId === "text-style"}
                  className={cn(
                    "flex h-10 min-w-10 flex-1 basis-0 items-center justify-center rounded-lg transition-colors",
                    openGroupId === "text-style"
                      ? "bg-gray-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                      : "bg-gray-100 text-gray-700 active:bg-gray-200 dark:bg-neutral-800 dark:text-neutral-200 dark:active:bg-neutral-700",
                  )}
                  onPointerDown={(event) => {
                    handleGroupPointerDown(event, "text-style");
                  }}
                >
                  <Type size={16} strokeWidth={2.5} />
                </button>
                {visiblePrimaryActions.map((action) => {
                  const active = controller.isActionActive(action.id);
                  const disabled = controller.isActionDisabled(action.id);
                  return (
                    <button
                      key={action.id}
                      ref={(node) => {
                        if (isPaletteAction(action.id)) {
                          primaryActionRefs.current[action.id] = node;
                        }
                      }}
                      type="button"
                      aria-label={action.label}
                      disabled={disabled}
                      aria-disabled={disabled}
                      className={cn(
                        "flex h-10 min-w-10 flex-1 basis-0 items-center justify-center rounded-lg text-gray-600 transition-colors dark:text-neutral-300",
                        disabled
                          ? "cursor-not-allowed bg-gray-100 opacity-45 dark:bg-neutral-800"
                          : null,
                        active && !disabled
                          ? "bg-gray-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                          : "bg-gray-100 active:bg-gray-200 dark:bg-neutral-800 dark:active:bg-neutral-700",
                      )}
                      onPointerDown={
                        disabled
                          ? undefined
                          : (event) => {
                              handleActionPointerDown(event, action.id);
                            }
                      }
                    >
                      {ACTION_ICONS[action.id]}
                    </button>
                  );
                })}
                <button
                  ref={(node) => {
                    triggerRefs.current.more = node;
                  }}
                  type="button"
                  aria-label="更多菜单"
                  aria-expanded={openGroupId === "more"}
                  className={cn(
                    "flex h-10 min-w-10 flex-1 basis-0 items-center justify-center rounded-lg transition-colors",
                    openGroupId === "more"
                      ? "bg-gray-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                      : "bg-gray-100 text-gray-700 active:bg-gray-200 dark:bg-neutral-800 dark:text-neutral-200 dark:active:bg-neutral-700",
                  )}
                  onPointerDown={(event) => {
                    handleGroupPointerDown(event, "more");
                  }}
                >
                  <Ellipsis size={16} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          </nav>,
          document.body,
        )
      : null;

  return (
    <>
      {toolbarNode}
      {menuNode}
      {paletteNode}
      <ContentLinkPickerSheet
        open={controller.isContentLinkPickerOpen}
        onClose={controller.handleCloseContentLinkPicker}
        onSelect={controller.handleSelectContentLink}
      />
    </>
  );
}

export default MobileEditorBottomToolbar;
