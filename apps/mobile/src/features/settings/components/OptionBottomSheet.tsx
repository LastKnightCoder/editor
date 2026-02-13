import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";

type BottomSheetOption = {
  label: string;
  value: string;
};

export type OptionBottomSheetProps = {
  open: boolean;
  title: string;
  value: string;
  options: BottomSheetOption[];
  loading?: boolean;
  emptyText?: string;
  cancelText?: string;
  refreshLabel?: string;
  onClose: () => void;
  onSelect: (value: string) => void;
  onRefresh?: () => void;
};

export function OptionBottomSheet(props: OptionBottomSheetProps) {
  const [shouldRender, setShouldRender] = useState(props.open);

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
        <div className="border-t border-gray-200 px-4 py-6 text-center text-sm text-gray-500 dark:border-neutral-700 dark:text-neutral-400">
          加载中...
        </div>
      );
    }
    if (!props.options.length) {
      return (
        <div className="border-t border-gray-200 px-4 py-6 text-center text-sm text-gray-500 dark:border-neutral-700 dark:text-neutral-400">
          {props.emptyText ?? "暂无可选项"}
        </div>
      );
    }
    return props.options.map((option, index) => {
      const selected = option.value === props.value;
      return (
        <button
          key={option.value}
          type="button"
          className={`relative block w-full py-4 text-center text-xl font-medium transition-colors ${
            index > 0 ? "border-t border-gray-200 dark:border-neutral-700" : ""
          } ${
            selected
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-gray-900 active:bg-gray-100 dark:text-neutral-100 dark:active:bg-neutral-800"
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
              className="absolute right-5 top-1/2 -translate-y-1/2"
            />
          ) : null}
        </button>
      );
    });
  }, [
    props.emptyText,
    props.loading,
    props.onClose,
    props.onSelect,
    props.options,
    props.value,
  ]);

  if (!shouldRender || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[80]">
      <button
        type="button"
        className={`absolute inset-0 bg-black/50 dark:bg-black/70 ${props.open ? "mask-enter" : "mask-exit"}`}
        aria-label="关闭选择面板"
        onClick={props.onClose}
      />

      <section
        className={`mobile-kb-scroll absolute bottom-0 left-0 right-0 overflow-hidden rounded-t-2xl bg-white shadow-[0_-10px_30px_rgba(0,0,0,0.16)] dark:bg-neutral-900 dark:shadow-[0_-12px_34px_rgba(0,0,0,0.52)] ${props.open ? "sheet-enter" : "sheet-exit"}`}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-neutral-700">
          <div className="min-w-0 flex-1 text-sm font-medium text-gray-800 dark:text-neutral-100">
            {props.title}
          </div>
          {props.onRefresh ? (
            <button
              type="button"
              onClick={props.onRefresh}
              className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 transition-colors active:bg-gray-100 dark:border-neutral-700 dark:text-neutral-300 dark:active:bg-neutral-800"
            >
              {props.refreshLabel ?? "刷新"}
            </button>
          ) : null}
        </div>
        {content}
        <button
          type="button"
          className="block w-full border-t border-gray-200 py-4 text-center text-xl font-medium text-gray-900 transition-colors active:bg-gray-100 dark:border-neutral-700 dark:text-neutral-100 dark:active:bg-neutral-800"
          onClick={props.onClose}
        >
          {props.cancelText ?? "取消"}
        </button>
      </section>
    </div>,
    document.body,
  );
}

export default OptionBottomSheet;
