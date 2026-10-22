import { useEffect, useMemo, useState } from "react";
import { Z_INDEX } from "../router/zIndex";
import { useSheetBackDismiss } from "../router/useSheetBackDismiss";
import { createPortal } from "react-dom";

type MobileConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
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
  description,
  cancelText = "取消",
  confirmText = "确认",
  danger = false,
  loading = false,
  onCancel,
  onConfirm,
}: MobileConfirmDialogProps) {
  const [shouldRender, setShouldRender] = useState(open);

  // 返回手势等同取消（对齐原生 Dialog 行为）；loading 中不拦截，避免中断进行中的操作
  useSheetBackDismiss(open && !loading, onCancel);

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
    return danger ? "text-tag-5" : "text-accent";
  }, [danger]);

  if (!shouldRender || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0" style={{ zIndex: Z_INDEX.CONFIRM }}>
      <button
        type="button"
        className={`bg-overlay absolute inset-0 ${open ? "mask-enter" : "mask-exit"}`}
        aria-label="关闭确认框"
        onClick={onCancel}
        disabled={loading}
      />

      <div
        className={`card absolute left-1/2 top-1/2 w-[min(86vw,340px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl transition-all duration-200 ${open ? "opacity-100" : "scale-95 opacity-0"}`}
      >
        <div
          className={`text-ink-1 px-6 text-center text-[16px] font-bold ${description ? "pt-6" : "py-6"}`}
        >
          {title}
        </div>
        {description ? (
          <p className="text-ink-2 px-6 pb-5 pt-2 text-center text-[13px] leading-relaxed">
            {description}
          </p>
        ) : null}
        <div className="border-line-1 grid grid-cols-2 border-t border-dashed">
          <button
            type="button"
            className="text-ink-2 active:bg-hover py-3.5 text-[15px] font-semibold transition-colors disabled:opacity-60"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`border-line-1 active:bg-hover border-l border-dashed py-3.5 text-[15px] font-bold transition-colors disabled:opacity-60 ${confirmClass}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default MobileConfirmDialog;
