import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type MobileConfirmDialogProps = {
  open: boolean;
  title: string;
  cancelText?: string;
  confirmText?: string;
  danger?: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function MobileConfirmDialog({
  open,
  title,
  cancelText = "取消",
  confirmText = "确认",
  danger = false,
  loading = false,
  onCancel,
  onConfirm,
}: MobileConfirmDialogProps) {
  const [shouldRender, setShouldRender] = useState(open);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      return;
    }
    if (!shouldRender) return;
    const timer = setTimeout(() => {
      setShouldRender(false);
    }, 200);
    return () => {
      clearTimeout(timer);
    };
  }, [open, shouldRender]);

  const confirmClass = useMemo(() => {
    if (!danger) {
      return "text-gray-800 dark:text-neutral-100";
    }
    return "text-red-600 dark:text-red-400";
  }, [danger]);

  if (!shouldRender || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[80]">
      <button
        type="button"
        className={`absolute inset-0 bg-black/50 dark:bg-black/70 ${open ? "mask-enter" : "mask-exit"}`}
        aria-label="关闭确认框"
        onClick={onCancel}
        disabled={loading}
      />

      <div
        className={`absolute left-1/2 top-1/2 w-[min(86vw,340px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl transition-all dark:border-neutral-700 dark:bg-neutral-900 ${open ? "opacity-100" : "opacity-0 scale-95"}`}
      >
        <div className="px-6 py-7 text-center text-[18px] font-medium text-gray-900 dark:text-neutral-100">
          {title}
        </div>
        <div className="grid grid-cols-2 border-t border-gray-200 dark:border-neutral-700">
          <button
            type="button"
            className="py-4 text-[18px] font-medium text-gray-700 transition-colors active:bg-gray-100 disabled:opacity-60 dark:text-neutral-200 dark:active:bg-neutral-800"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`border-l border-gray-200 py-4 text-[18px] font-semibold transition-colors active:bg-gray-100 disabled:opacity-60 dark:border-neutral-700 dark:active:bg-neutral-800 ${confirmClass}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default MobileConfirmDialog;
