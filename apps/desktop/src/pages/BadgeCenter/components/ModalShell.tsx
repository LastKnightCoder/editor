import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { X } from "lucide-react";
import useThemeColors from "@/hooks/useThemeColors";

export interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  widthClass?: string;
  children: ReactNode;
  footer?: ReactNode;
  closeOnBackdrop?: boolean;
}

const EXIT_ANIMATION_MS = 200;

const ModalShell = ({
  open,
  onClose,
  title,
  subtitle,
  widthClass = "max-w-3xl",
  children,
  footer,
  closeOnBackdrop = true,
}: ModalShellProps) => {
  const themeColors = useThemeColors();
  const [hasOpened, setHasOpened] = useState(open);
  const closeTimerRef = useRef<number | null>(null);
  const shouldRender = open || hasOpened;

  useEffect(() => {
    if (open) {
      setHasOpened(true);
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      return;
    }

    if (!hasOpened) return;

    closeTimerRef.current = window.setTimeout(() => {
      setHasOpened(false);
      closeTimerRef.current = null;
    }, EXIT_ANIMATION_MS);

    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [open, hasOpened]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  if (!shouldRender) return null;

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: open ? 1 : 0 }}
      transition={{ duration: 0.2 }}
      style={{ pointerEvents: open ? "auto" : "none" }}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => closeOnBackdrop && onClose()}
      />
      <motion.div
        className={`relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-3xl border shadow-2xl backdrop-blur-xl ${widthClass} ${themeColors.glassPanelBg} ${themeColors.cardBorderClass}`}
        initial={{ y: 32, opacity: 0, scale: 0.96 }}
        animate={{
          y: open ? 0 : 32,
          opacity: open ? 1 : 0,
          scale: open ? 1 : 0.96,
        }}
        transition={{ duration: 0.2 }}
      >
        <div
          className={`flex items-start justify-between gap-4 border-b px-7 py-5 ${themeColors.borderClass}`}
        >
          <div>
            <h2
              className={`m-0 text-xl font-semibold ${themeColors.activeTextClass}`}
            >
              {title}
            </h2>
            {subtitle && (
              <p className={`mt-1 text-sm ${themeColors.secondaryTextClass}`}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${themeColors.tagBgClass} ${themeColors.textClass} ${themeColors.hoverClass}`}
          >
            <X size={16} />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 gap-5 overflow-auto px-7 py-6">
          {children}
        </div>
        {footer && (
          <div
            className={`flex justify-end gap-3 border-t px-7 py-4 ${themeColors.borderClass}`}
          >
            {footer}
          </div>
        )}
      </motion.div>
    </motion.div>,
    document.body,
  );
};

export default ModalShell;
