import React, { memo, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import classNames from "classnames";
import styles from "./index.module.less";

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
      document.body,
    );
  },
);

FullscreenPortal.displayName = "FullscreenPortal";

export default FullscreenPortal;
