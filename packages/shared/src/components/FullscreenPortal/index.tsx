import React, { memo, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn as classNames } from "@tau/ui";
import "../animations.css";

const styles = {
  overlay:
    "fixed inset-0 z-[10000] flex items-center justify-center bg-overlay backdrop-blur-[4px] animate-[tau-shared-fade_0.2s_ease-in-out]",
  container:
    "bg-surface rounded-tau-md shadow-float flex h-[95vh] w-[95vw] flex-col overflow-hidden animate-[tau-shared-scale-in_0.3s_ease-out]",
  header: "bg-hover flex shrink-0 items-center justify-between px-6 py-4",
  title: "text-ink-1 text-tau-title font-semibold",
  closeBtn:
    "text-ink-2 hover:text-ink-1 hover:bg-hover rounded-tau-sm flex size-8 cursor-pointer items-center justify-center border-0 bg-transparent transition-colors active:scale-95",
  content: "flex min-h-0 flex-1 flex-col overflow-hidden",
};

interface FullscreenPortalProps {
  children: React.ReactNode;
  onClose: () => void;
  title?: string;
  className?: string;
  hideHeader?: boolean;
}

const FullscreenPortal: React.FC<FullscreenPortalProps> = memo(
  ({ children, onClose, title, className, hideHeader = false }) => {
    useEffect(() => {
      // 禁止body滚动
      document.body.style.overflow = "hidden";

      // ESC键关闭
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          onClose();
        }
      };

      window.addEventListener("keydown", handleKeyDown);

      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", handleKeyDown);
      };
    }, [onClose]);

    return createPortal(
      <div className={classNames(styles.overlay, className)}>
        <div className={styles.container}>
          {!hideHeader && (
            <div className={styles.header}>
              <div className={styles.title}>{title || "Fullscreen View"}</div>
              <button className={styles.closeBtn} onClick={onClose}>
                <X size={18} />
              </button>
            </div>
          )}

          <div className={styles.content}>{children}</div>
        </div>
      </div>,
      document.body
    );
  }
);

FullscreenPortal.displayName = "FullscreenPortal";

export default FullscreenPortal;
