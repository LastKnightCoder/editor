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
        <div className="flex flex-col items-center gap-2.5 px-5 py-8">
          <span className="border-line-2 border-t-accent h-6 w-6 animate-spin rounded-full border-[3px]" />
          <div className="text-ink-3 text-[13.5px] font-medium">加载中...</div>
        </div>
      );
    }
    if (!props.options.length) {
      return (
        <div className="flex flex-col items-center gap-2.5 px-5 py-8">
          <Inbox size={24} strokeWidth={1.8} className="text-ink-3" />
          <div className="text-ink-3 text-[13.5px] font-medium">
            {props.emptyText ?? "暂无可选项"}
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col px-2.5 py-1.5">
        {props.options.map(option => {
          const selected = option.value === props.value;
          return (
            <button
              key={option.value}
              type="button"
              className={`active:bg-hover flex w-full items-center justify-between rounded-[14px] px-3.5 py-[13px] text-left text-[15px] transition-colors ${
                selected ? "text-accent font-bold" : "text-ink-1 font-medium"
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
        className={`bg-overlay absolute inset-0 ${props.open ? "mask-enter" : "mask-exit"}`}
        aria-label="关闭选择面板"
        onClick={props.onClose}
      />

      <section
        data-allow-touchmove="true"
        className={`mobile-kb-scroll bg-surface shadow-float rounded-t-sheet absolute bottom-0 left-0 right-0 touch-pan-y overflow-y-auto overscroll-y-contain ${props.open ? "sheet-enter" : "sheet-exit"}`}
        style={{
          maxHeight: "calc(var(--kb-viewport-height, 100dvh) - var(--mobile-safe-top) - 3rem)",
        }}
      >
        <div className="sheet-grab" />
        <div className="pb-[10px]">
          <div className="border-line-2 border-b px-6 pb-[14px] pt-1.5">
            <div className="text-ink-1 truncate text-[17px] font-bold">{props.title}</div>
          </div>
          {content}
          <div className="px-2.5 pt-1.5">
            <button
              type="button"
              className="text-ink-2 active:bg-hover w-full rounded-[14px] py-[13px] text-[15px] font-bold transition-colors"
              onClick={props.onClose}
            >
              {props.cancelText ?? "取消"}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}

export default ActionSheet;
