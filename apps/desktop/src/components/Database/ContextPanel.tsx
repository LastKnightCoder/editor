import { memo, useRef, useLayoutEffect, useState, ReactNode } from "react";
import { createPortal } from "react-dom";
import classNames from "classnames";

interface ContextPanelProps {
  open: boolean;
  triggerRef: React.RefObject<HTMLElement>;
  children: ReactNode;
  onClose?: () => void;
  placement?: "bottom" | "bottomLeft" | "bottomRight";
  className?: string;
}

const ContextPanel = memo<ContextPanelProps>(
  ({
    open,
    triggerRef,
    children,
    onClose,
    placement = "bottom",
    className,
  }) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{
      top: number;
      left: number;
    } | null>(null);

    useLayoutEffect(() => {
      if (!open || !triggerRef.current || !panelRef.current) return;

      const updatePosition = () => {
        if (!triggerRef.current || !panelRef.current) return;

        const triggerRect = triggerRef.current.getBoundingClientRect();
        const panelRect = panelRef.current.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        const SPACING = 8;
        const EDGE_PADDING = 16;

        let top = triggerRect.bottom + SPACING;
        let left = triggerRect.left;

        // Adjust horizontal position based on placement
        if (placement === "bottomRight") {
          left = triggerRect.right - panelRect.width;
        } else if (placement === "bottom") {
          left = triggerRect.left + triggerRect.width / 2 - panelRect.width / 2;
        }

        // Check right edge
        if (left + panelRect.width > viewportWidth - EDGE_PADDING) {
          left = viewportWidth - panelRect.width - EDGE_PADDING;
        }

        // Check left edge
        if (left < EDGE_PADDING) {
          left = EDGE_PADDING;
        }

        // Check bottom edge
        if (top + panelRect.height > viewportHeight - EDGE_PADDING) {
          // Try to place above trigger
          const topAbove = triggerRect.top - panelRect.height - SPACING;
          if (topAbove >= EDGE_PADDING) {
            top = topAbove;
          } else {
            // Keep below but adjust to fit
            top = Math.max(
              EDGE_PADDING,
              viewportHeight - panelRect.height - EDGE_PADDING,
            );
          }
        }

        // Check top edge
        if (top < EDGE_PADDING) {
          top = EDGE_PADDING;
        }

        setPosition({ top, left });
      };

      // Initial position calculation
      updatePosition();

      // Recalculate after a frame to ensure panel has rendered
      requestAnimationFrame(updatePosition);
    }, [open, placement, triggerRef]);

    useLayoutEffect(() => {
      if (!open) {
        setPosition(null);
        return;
      }

      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement;

        // Check if click is inside a ColumnDropdown
        const isInsideColumnDropdown = target.closest(
          '[data-column-dropdown="true"]',
        );
        if (isInsideColumnDropdown) {
          return;
        }

        if (
          panelRef.current &&
          !panelRef.current.contains(e.target as Node) &&
          triggerRef.current &&
          !triggerRef.current.contains(e.target as Node)
        ) {
          onClose?.();
        }
      };

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          onClose?.();
        }
      };

      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);

      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleEscape);
      };
    }, [open, onClose, triggerRef]);

    if (!open) return null;

    const style: React.CSSProperties = position
      ? {
          top: `${position.top}px`,
          left: `${position.left}px`,
          animation: "fadeInPanel 120ms ease-out",
        }
      : { opacity: 0 };

    const panel = (
      <>
        <style>{`
          @keyframes fadeInPanel {
            from {
              opacity: 0;
              transform: translateY(6px) scale(0.98);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
        `}</style>
        <div
          ref={panelRef}
          className={classNames(
            "fixed z-[100] min-w-[140px] max-w-[520px] p-2 rounded-[18px]",
            "bg-[rgba(248,250,255,0.9)] dark:bg-[rgba(10,15,28,0.85)]",
            "border border-[rgba(255,255,255,0.45)] dark:border-[rgba(255,255,255,0.12)]",
            "shadow-[0_18px_45px_rgba(15,23,42,0.25)] dark:shadow-[0_22px_60px_rgba(2,6,23,0.7)]",
            "backdrop-blur-[18px]",
            className,
          )}
          style={style}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </>
    );

    return createPortal(panel, document.body);
  },
);

ContextPanel.displayName = "ContextPanel";

export default ContextPanel;
