import React, { useCallback, useEffect, ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import "./index.css";

export interface CustomModalProps {
  open: boolean;
  onCancel: () => void;
  children: ReactNode;
  width?: number | string;
  className?: string;
  overlayClassName?: string;
  closeOnOverlay?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  title?: string;
  icon?: ReactNode;
  iconBgColor?: string;
  subtitle?: string;
  footer?: ReactNode;
}

const CustomModal: React.FC<CustomModalProps> = ({
  open,
  onCancel,
  children,
  width = 460,
  className = "",
  overlayClassName = "",
  closeOnOverlay = true,
  closeOnEscape = true,
  showCloseButton = true,
  title,
  icon,
  iconBgColor = "bg-indigo-50 dark:bg-indigo-500/20 border-indigo-200 dark:border-indigo-500/30",
  subtitle,
  footer,
}) => {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && closeOnEscape) {
        onCancel();
      }
    },
    [onCancel, closeOnEscape],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [open, handleKeyDown]);

  const widthStyle =
    typeof width === "number"
      ? { maxWidth: `${width}px` }
      : { maxWidth: width };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={`custom-modal-overlay fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm ${overlayClassName}`}
          onClick={closeOnOverlay ? onCancel : undefined}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className={`custom-modal-container w-full m-4 ${className}`}
            style={widthStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-2xl p-6 shadow-2xl bg-white dark:bg-slate-900/95 border border-gray-200 dark:border-slate-800">
              {/* Header */}
              {(title || showCloseButton) && (
                <div className="flex items-start mb-5">
                  {title ? (
                    <>
                      <div
                        className={`flex gap-3 flex-1 ${subtitle ? "items-start" : "items-center"}`}
                      >
                        {icon && (
                          <div
                            className={`shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center border ${iconBgColor}`}
                          >
                            {icon}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h2 className="text-base font-bold m-0 text-gray-800 dark:text-white">
                            {title}
                          </h2>
                          {subtitle && (
                            <p className="text-xs mt-0.5 text-gray-500 dark:text-slate-500">
                              {subtitle}
                            </p>
                          )}
                        </div>
                      </div>
                      {showCloseButton && (
                        <button
                          className="shrink-0 w-8 h-8 ml-3 rounded-lg border-none cursor-pointer flex items-center justify-center transition-all bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-slate-200"
                          onClick={onCancel}
                        >
                          <svg
                            className="w-[18px] h-[18px]"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M18 6 6 18M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </>
                  ) : (
                    showCloseButton && (
                      <button
                        className="shrink-0 w-8 h-8 ml-auto rounded-lg border-none cursor-pointer flex items-center justify-center transition-all bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-slate-200"
                        onClick={onCancel}
                      >
                        <svg
                          className="w-[18px] h-[18px]"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                      </button>
                    )
                  )}
                </div>
              )}

              {/* Body */}
              <div className="custom-modal-body">{children}</div>

              {/* Footer */}
              {footer && (
                <div className="custom-modal-footer mt-5">{footer}</div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export default CustomModal;
