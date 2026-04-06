import { useEffect, useRef, useState } from "react";
import type { HighlightStyle } from "../types";
import type { ToolbarPlacement } from "./overlayPosition";

interface FloatingToolbarProps {
  position: { x: number; y: number };
  placement: ToolbarPlacement;
  onCopy: () => void;
  onHighlight: (style: HighlightStyle) => void;
  onThought: () => void;
  onAskAI: () => void;
  visible: boolean;
  activeStyle?: HighlightStyle;
  onDelete?: () => void;
  onDisableForever?: () => void;
  onDisableForSession?: () => void;
}

export default function FloatingToolbar({
  position,
  placement,
  onCopy,
  onHighlight,
  onThought,
  onAskAI,
  visible,
  activeStyle,
  onDelete,
  onDisableForever,
  onDisableForSession,
}: FloatingToolbarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!visible) {
      setMoreOpen(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!moreOpen) return;

    const handleOutsideClick = (event: MouseEvent) => {
      const container = moreContainerRef.current;
      if (!container) return;

      const path = event.composedPath();
      if (path.includes(container)) return;
      setMoreOpen(false);
    };

    document.addEventListener("mousedown", handleOutsideClick, true);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick, true);
    };
  }, [moreOpen]);

  if (!visible) return null;

  const stopEvent = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  const handleToggleMore = (e: React.MouseEvent) => {
    stopEvent(e);
    setMoreOpen((prev) => !prev);
  };

  const handleDisableForever = (e: React.MouseEvent) => {
    stopEvent(e);
    setMoreOpen(false);
    onDisableForever?.();
  };

  const handleDisableForSession = (e: React.MouseEvent) => {
    stopEvent(e);
    setMoreOpen(false);
    onDisableForSession?.();
  };

  return (
    <div
      style={{
        position: "fixed",
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform:
          placement === "above"
            ? "translate(-50%, -100%)"
            : "translate(-50%, 0)",
        zIndex: 2147483647,
      }}
      className="tau-floating-toolbar"
      onMouseDown={stopEvent}
    >
      <button onClick={onCopy} title="复制">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </button>
      <div className="tau-toolbar-divider" />
      <button
        className={activeStyle === "marker" ? "tau-toolbar-btn-active" : ""}
        onClick={() => onHighlight("marker")}
        title="马克笔"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      </button>
      <button
        className={activeStyle === "wavy" ? "tau-toolbar-btn-active" : ""}
        onClick={() => onHighlight("wavy")}
        title="波浪线"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
        </svg>
      </button>
      <button
        className={activeStyle === "straight" ? "tau-toolbar-btn-active" : ""}
        onClick={() => onHighlight("straight")}
        title="直线"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 17h20" />
        </svg>
      </button>
      {onDelete && (
        <button onClick={onDelete} title="删除划线">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      )}
      <div className="tau-toolbar-divider" />
      <button onClick={onThought} title="写想法">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
      <button onClick={onAskAI} title="AI问书">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </button>
      <div className="tau-toolbar-divider" />
      <div className="tau-toolbar-more" ref={moreContainerRef}>
        <button onClick={handleToggleMore} title="更多">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="5" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="19" r="1.5" />
          </svg>
        </button>
        {moreOpen && (
          <div className="tau-toolbar-more-menu">
            <button
              className="tau-toolbar-more-item"
              onClick={handleDisableForSession}
              title="本次会话不再自动出现"
            >
              禁用一次
            </button>
            <button
              className="tau-toolbar-more-item tau-toolbar-more-item-danger"
              onClick={handleDisableForever}
              title="永久不再自动出现"
            >
              永久禁用
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
