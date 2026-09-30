import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import classnames from "classnames";

import type { HoveringSubmenuTrigger } from "./context";
import { calculateFloatingPosition, type FloatingPlacement } from "./floatingPosition";

const DEFAULT_GAP = 8;
const HOVER_CLOSE_DELAY = 120;
/** 悬停意图：停留这么久才展开，鼠标划过工具条不连环弹面板 */
const HOVER_OPEN_DELAY = 120;

interface FloatingSubmenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: HoveringSubmenuTrigger;
  isHoveringBarShow: boolean;
  children: React.ReactNode;
  content: React.ReactNode;
  preferredPlacement?: FloatingPlacement;
  gap?: number;
  zIndex?: number;
  triggerClassName?: string;
  panelClassName?: string;
  panelStyle?: React.CSSProperties;
}

const FloatingSubmenu = (props: FloatingSubmenuProps) => {
  const {
    open,
    onOpenChange,
    trigger,
    isHoveringBarShow,
    children,
    content,
    preferredPlacement = "bottom",
    gap = DEFAULT_GAP,
    zIndex = 10100,
    triggerClassName,
    panelClassName,
    panelStyle,
  } = props;

  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [positionReady, setPositionReady] = useState(false);

  const openTimerRef = useRef<number | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  const openWithDelay = useCallback(() => {
    clearCloseTimer();
    if (open) {
      return;
    }
    openTimerRef.current = window.setTimeout(() => {
      onOpenChange(true);
      openTimerRef.current = null;
    }, HOVER_OPEN_DELAY);
  }, [clearCloseTimer, onOpenChange, open]);

  const closeWithDelay = useCallback(() => {
    if (trigger !== "hover") {
      return;
    }
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      onOpenChange(false);
      closeTimerRef.current = null;
    }, HOVER_CLOSE_DELAY);
  }, [clearCloseTimer, onOpenChange, trigger]);

  const updatePosition = useCallback(() => {
    const triggerEl = triggerRef.current;
    const panelEl = panelRef.current;
    if (!triggerEl || !panelEl) {
      return;
    }

    const anchorRect = triggerEl.getBoundingClientRect();
    const panelRect = panelEl.getBoundingClientRect();
    const visualViewport = window.visualViewport;
    const viewportWidth = Math.round(visualViewport?.width ?? window.innerWidth);
    const viewportHeight = Math.round(visualViewport?.height ?? window.innerHeight);
    const next = calculateFloatingPosition({
      anchorRect,
      viewportWidth,
      viewportHeight,
      floatingWidth: panelRect.width,
      floatingHeight: panelRect.height,
      preferredPlacement,
      gap,
    });

    setPosition({
      left: next.left,
      top: next.top,
    });
    setPositionReady(true);
  }, [gap, preferredPlacement]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    setPositionReady(false);
    const frame = window.requestAnimationFrame(updatePosition);
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const scheduleUpdate = () => {
      window.requestAnimationFrame(updatePosition);
    };

    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);
    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener("resize", scheduleUpdate);
    visualViewport?.addEventListener("scroll", scheduleUpdate);

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            scheduleUpdate();
          })
        : null;
    if (observer) {
      if (triggerRef.current) {
        observer.observe(triggerRef.current);
      }
      if (panelRef.current) {
        observer.observe(panelRef.current);
      }
    }

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
      visualViewport?.removeEventListener("resize", scheduleUpdate);
      visualViewport?.removeEventListener("scroll", scheduleUpdate);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (triggerRef.current?.contains(target)) {
        return;
      }
      if (panelRef.current?.contains(target)) {
        return;
      }
      onOpenChange(false);
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    };
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) {
      clearCloseTimer();
      return;
    }
    if (!isHoveringBarShow) {
      onOpenChange(false);
    }
  }, [clearCloseTimer, isHoveringBarShow, onOpenChange, open]);

  useEffect(() => {
    return () => {
      clearCloseTimer();
    };
  }, [clearCloseTimer]);

  const mergedPanelStyle = useMemo<React.CSSProperties>(() => {
    return {
      position: "fixed",
      left: position.left,
      top: position.top,
      zIndex,
      visibility: positionReady ? "visible" : "hidden",
      ...panelStyle,
    };
  }, [panelStyle, position.left, position.top, positionReady, zIndex]);

  const panelNode =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            data-floating-submenu-panel="true"
            className={classnames(panelClassName)}
            style={mergedPanelStyle}
            onMouseEnter={() => {
              if (trigger === "hover") {
                clearCloseTimer();
              }
            }}
            onMouseLeave={() => {
              closeWithDelay();
            }}
            onPointerDown={event => {
              event.stopPropagation();
            }}
            onClick={event => {
              event.stopPropagation();
            }}
          >
            {content}
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <span
        ref={triggerRef}
        data-floating-submenu-trigger="true"
        className={classnames("inline-flex", triggerClassName)}
        onMouseEnter={() => {
          if (trigger === "hover") {
            openWithDelay();
          }
        }}
        onMouseLeave={() => {
          closeWithDelay();
        }}
        onClick={() => {
          if (trigger === "click") {
            clearCloseTimer();
            onOpenChange(!open);
          }
        }}
      >
        {children}
      </span>
      {panelNode}
    </>
  );
};

export default FloatingSubmenu;
