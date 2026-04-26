import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
  CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import classNames from "classnames";
import { motion } from "motion/react";
import useThemeColors from "@/hooks/useThemeColors";
import "./index.css";

const ANIMATION_DURATION = 200;

export interface CustomModalProps {
  open: boolean;
  onCancel: () => void;
  children: ReactNode;
  width?: number | string;
  className?: string;
  overlayClassName?: string;
  bodyClassName?: string;
  contentClassName?: string;
  overlayStyle?: CSSProperties;
  contentStyle?: CSSProperties;
  closeOnOverlay?: boolean;
  maskClosable?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  closeIcon?: ReactNode | null;
  title?: ReactNode;
  icon?: ReactNode;
  iconBgColor?: string;
  subtitle?: ReactNode;
  footer?: ReactNode | null;
  footerAlign?: "start" | "center" | "end";
  onOk?: () => void | Promise<void>;
  okText?: ReactNode;
  cancelText?: ReactNode;
  okButtonProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
  cancelButtonProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
  confirmLoading?: boolean;
  destroyOnClose?: boolean;
  centered?: boolean;
  afterClose?: () => void;
}

const CustomModal: React.FC<CustomModalProps> = ({
  open,
  onCancel,
  children,
  width = 460,
  className = "",
  overlayClassName = "",
  bodyClassName = "",
  contentClassName = "",
  overlayStyle: overlayStyleProp,
  contentStyle,
  closeOnOverlay,
  maskClosable,
  closeOnEscape = true,
  showCloseButton = true,
  closeIcon,
  title,
  icon,
  iconBgColor = "bg-indigo-50 dark:bg-indigo-500/20 border-indigo-200 dark:border-indigo-500/30",
  subtitle,
  footer,
  footerAlign = "end",
  onOk,
  okText = "确定",
  cancelText = "取消",
  okButtonProps,
  cancelButtonProps,
  confirmLoading = false,
  destroyOnClose = false,
  centered = true,
  afterClose,
}) => {
  const themeColors = useThemeColors();
  const [hasOpened, setHasOpened] = useState(open);
  const [isHidden, setIsHidden] = useState(!open);
  const closeTimerRef = useRef<number | null>(null);
  const overlayClosable =
    typeof maskClosable === "boolean" ? maskClosable : (closeOnOverlay ?? true);
  const shouldRender = open || hasOpened;
  const computedCloseIcon = closeIcon ?? (
    <svg
      className="w-[18px] h-[18px]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );

  const footerAlignmentClass =
    footerAlign === "start"
      ? "justify-start"
      : footerAlign === "center"
        ? "justify-center"
        : "justify-end";

  const widthStyle = useMemo(() => {
    if (typeof width === "number") {
      return { maxWidth: `${width}px` };
    }
    if (width) {
      return { maxWidth: width };
    }
    return undefined;
  }, [width]);

  const baseButtonClass =
    "inline-flex items-center justify-center gap-2 px-4 h-10 rounded-xl text-sm font-medium transition-all focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed";
  const cancelButtonClass = classNames(
    baseButtonClass,
    "border bg-transparent",
    themeColors.borderClass,
    themeColors.hoverClass,
    themeColors.textClass,
  );
  const okButtonClass = classNames(
    baseButtonClass,
    "border-none shadow-sm",
    themeColors.buttonBg,
    themeColors.buttonTextClass,
  );

  const stopKeyboardPropagation = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      // 检查事件目标是否是可编辑元素
      const target = event.target as HTMLElement;
      const isEditable =
        target.isContentEditable ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.closest("[contenteditable='true']") !== null ||
        target.closest("[role='textbox']") !== null;

      // 如果是可编辑元素，不阻止事件传播，让编辑器处理快捷键
      if (isEditable) {
        return;
      }

      // 对于非可编辑元素，只允许 Enter 键传播
      if (event.key !== "Enter") {
        event.stopPropagation();
      }
    },
    [],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && closeOnEscape && open) {
        onCancel();
      }
    },
    [closeOnEscape, onCancel, open],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [open, handleKeyDown]);

  useEffect(() => {
    if (open) {
      setHasOpened(true);
      setIsHidden(false);
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      return;
    }

    if (!hasOpened) {
      if (afterClose) afterClose();
      return;
    }

    closeTimerRef.current = window.setTimeout(() => {
      if (destroyOnClose) {
        setHasOpened(false);
      } else {
        setIsHidden(true);
      }
      if (afterClose) afterClose();
      closeTimerRef.current = null;
    }, ANIMATION_DURATION);

    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [open, destroyOnClose, hasOpened, afterClose]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const handleOverlayClick = () => {
    if (overlayClosable) {
      onCancel();
    }
  };

  const handleCancelClick = (
    event: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    cancelButtonProps?.onClick?.(event);
    if (event.defaultPrevented) return;
    onCancel();
  };

  const handleOkClick = async (
    event: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    okButtonProps?.onClick?.(event);
    if (event.defaultPrevented) return;
    await onOk?.();
  };

  const defaultFooter =
    footer === undefined && (onOk || cancelText || okText) ? (
      <div className={classNames("flex gap-3", footerAlignmentClass)}>
        {cancelText !== null && (
          <button
            type="button"
            {...cancelButtonProps}
            className={classNames(
              cancelButtonClass,
              cancelButtonProps?.className,
            )}
            onClick={handleCancelClick}
          >
            {cancelText}
          </button>
        )}
        {okText !== null && (
          <button
            type="button"
            {...okButtonProps}
            className={classNames(okButtonClass, okButtonProps?.className)}
            onClick={handleOkClick}
            disabled={confirmLoading || okButtonProps?.disabled}
            aria-busy={confirmLoading}
          >
            {confirmLoading && (
              <svg
                className="w-4 h-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="currentColor"
                  strokeOpacity="0.35"
                />
                <path
                  d="M12 3a9 9 0 0 1 9 9"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeOpacity="0.85"
                />
              </svg>
            )}
            <span>{okText}</span>
          </button>
        )}
      </div>
    ) : null;
  const footerNode = footer === null ? null : (footer ?? defaultFooter);

  if (!shouldRender) {
    return null;
  }

  const overlayStyle = {
    ...(!open && !destroyOnClose && isHidden ? { display: "none" } : undefined),
    ...overlayStyleProp,
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: open ? 1 : 0 }}
      transition={{ duration: 0.2 }}
      className={classNames(
        "custom-modal-overlay fixed inset-0 z-100 flex justify-center bg-black/50 backdrop-blur-sm px-4",
        centered ? "items-center" : "items-start pt-16",
        overlayClassName,
      )}
      style={{
        pointerEvents: open ? "auto" : "none",
        ...overlayStyle,
      }}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 12 }}
        animate={{
          opacity: open ? 1 : 0.95,
          scale: open ? 1 : 0.98,
          y: open ? 0 : 12,
        }}
        transition={{ duration: 0.2 }}
        className={classNames("custom-modal-container w-full", className)}
        style={widthStyle}
        onClick={(e) => e.stopPropagation()}
        data-whiteboard-stop-keyboard="true"
        onKeyDownCapture={stopKeyboardPropagation}
        onKeyUpCapture={stopKeyboardPropagation}
      >
        <div
          className={classNames(
            "rounded-2xl p-6 shadow-2xl bg-white/95 dark:bg-zinc-900/95 border backdrop-blur flex flex-col max-h-[calc(100vh-200px)] overflow-hidden",
            themeColors.cardBorderClass,
            contentClassName,
          )}
          style={contentStyle}
        >
          {(title || showCloseButton) && (
            <div className="flex items-start mb-5 shrink-0">
              {title ? (
                <>
                  <div
                    className={classNames(
                      "flex flex-1 gap-3",
                      subtitle ? "items-start" : "items-center",
                    )}
                  >
                    {icon && (
                      <div
                        className={classNames(
                          "shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center border",
                          iconBgColor,
                        )}
                      >
                        {icon}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h2 className={classNames("text-base font-bold m-0")}>
                        {title}
                      </h2>
                      {subtitle && (
                        <p
                          className={classNames(
                            "text-xs mt-0.5",
                            themeColors.secondaryTextClass,
                          )}
                        >
                          {subtitle}
                        </p>
                      )}
                    </div>
                  </div>
                  {showCloseButton && closeIcon !== null && (
                    <button
                      type="button"
                      className={classNames(
                        "shrink-0 w-8 h-8 ml-3 rounded-lg border-none cursor-pointer flex items-center justify-center transition-all",
                        themeColors.tagBgClass,
                        themeColors.textClass,
                        themeColors.tagHoverBgClass,
                        "hover:text-gray-700 dark:hover:text-gray-200",
                      )}
                      onClick={onCancel}
                    >
                      {computedCloseIcon}
                    </button>
                  )}
                </>
              ) : (
                showCloseButton &&
                closeIcon !== null && (
                  <button
                    type="button"
                    className={classNames(
                      "shrink-0 w-8 h-8 ml-auto rounded-lg border-none cursor-pointer flex items-center justify-center transition-all",
                      themeColors.tagBgClass,
                      themeColors.textClass,
                      themeColors.tagHoverBgClass,
                      "hover:text-gray-700 dark:hover:text-gray-200",
                    )}
                    onClick={onCancel}
                  >
                    {computedCloseIcon}
                  </button>
                )
              )}
            </div>
          )}

          <div
            className={classNames(
              "custom-modal-body flex-1 min-h-0 overflow-y-auto",
              bodyClassName,
            )}
          >
            {children}
          </div>

          {footerNode && (
            <div
              className={classNames(
                "custom-modal-footer mt-5 pt-4 shrink-0 border-t",
                themeColors.borderClass,
              )}
            >
              {footerNode}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
};

export default CustomModal;
