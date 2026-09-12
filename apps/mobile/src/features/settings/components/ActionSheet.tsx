import { useEffect, useMemo, useState } from "react";
import { Z_INDEX } from "../../../router/zIndex";
import { useSheetBackDismiss } from "../../../router/useSheetBackDismiss";
import { createPortal } from "react-dom";
import { Check, Inbox } from "lucide-react";

type ActionSheetOption = {
  label: string;
  value: string;
};

export type ActionSheetProps = {
  open: boolean;
  title: string;
  value: string;
  options: ActionSheetOption[];
  loading?: boolean;
  emptyText?: string;
  cancelText?: string;
  onClose: () => void;
  onSelect: (value: string) => void;
  /** 返回手势是否关闭本面板（默认 true）；overlay 路由页主体须传 false */
  backDismiss?: boolean;
};

export function ActionSheet(props: ActionSheetProps) {
  const [shouldRender, setShouldRender] = useState(props.open);

  useSheetBackDismiss(props.backDismiss !== false && props.open, props.onClose);

  useEffect(() => {
    if (props.open) {
      setShouldRender(true);
      return;
    }
    if (!shouldRender) return;
    const timer = window.setTimeout(() => {
      setShouldRender(false);
    }, 250);
    return () => {
      window.clearTimeout(timer);
    };
  }, [props.open, shouldRender]);

  const content = useMemo(() => {
    if (props.loading) {
      return (
        <div className="list-group flex flex-col items-center gap-2.5 px-5 py-8">
          <span className="border-line-soft border-t-accent h-6 w-6 animate-spin rounded-full border-[3px]" />
          <div className="text-ink-2 text-[13.5px] font-medium">加载中...</div>
        </div>
      );
    }
    if (!props.options.length) {
      return (
        <div className="list-group flex flex-col items-center gap-2.5 px-5 py-8">
          <Inbox size={24} strokeWidth={1.8} className="text-ink-3" />
          <div className="text-ink-2 text-[13.5px] font-medium">
            {props.emptyText ?? "暂无可选项"}
          </div>
        </div>
      );
    }
    return (
      <div className="list-group overflow-hidden">
        {props.options.map(option => {
          const selected = option.value === props.value;
          return (
            <button
              key={option.value}
              type="button"
              className={`list-item w-full justify-between text-[15px] transition-colors ${
                selected ? "text-accent font-bold" : "text-ink active:bg-press font-medium"
              }`}
              onClick={() => {
                props.onSelect(option.value);
                props.onClose();
              }}
            >
              {option.label}
              {selected ? (
                <Check
                  size={18}
                  strokeWidth={2.6}
                  className="check-pop text-accent flex-shrink-0"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    );
  }, [props.emptyText, props.loading, props.onClose, props.onSelect, props.options, props.value]);

  if (!shouldRender || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0" style={{ zIndex: Z_INDEX.CONFIRM }}>
      <button
        type="button"
        className={`bg-mask absolute inset-0 ${props.open ? "mask-enter" : "mask-exit"}`}
        aria-label="关闭选择面板"
        onClick={props.onClose}
      />

      <section
        data-allow-touchmove="true"
        className={`mobile-kb-scroll bg-page absolute bottom-0 left-0 right-0 touch-pan-y overflow-y-auto overscroll-y-contain rounded-t-[26px] ${props.open ? "sheet-enter" : "sheet-exit"}`}
        style={{
          maxHeight: "calc(var(--kb-viewport-height, 100dvh) - var(--mobile-safe-top) - 3rem)",
        }}
      >
        <div className="sheet-grab" />
        <div className="px-3.5 pb-[calc(env(safe-area-inset-bottom,0px)+14px)]">
          <div className="text-ink-2 pb-2.5 pt-3 text-center text-[12.5px] font-semibold">
            {props.title}
          </div>
          <div className="flex flex-col gap-2.5">
            {content}
            <div className="list-group overflow-hidden">
              <button
                type="button"
                className="text-ink-2 active:bg-press list-item w-full justify-center py-3 text-[15px] font-bold transition-colors"
                onClick={props.onClose}
              >
                {props.cancelText ?? "取消"}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}

export default ActionSheet;
