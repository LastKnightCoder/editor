/**
 * 子页内 Tab —— 重页（大语言模型 / 嵌入 / 同步…）按主题拆成几屏，下划线式（accent 2px）。
 * 只做视图切换，不改设置值；方向键在 tab 间移动（roving tabindex）。
 */

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import clsx from "clsx";

export interface SettingsTabItem<K extends string> {
  key: K;
  label: string;
  /** 角标（待处理数等），0/undefined 不渲染 */
  badge?: ReactNode;
}

export function SettingsTabs<K extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: SettingsTabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  label: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const index = items.findIndex(item => item.key === value);
    const next = items[(index + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length];
    onChange(next.key);
    listRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${next.key}"]`)?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      className="-mt-2 mb-6 flex gap-[22px]"
      onKeyDown={onKeyDown}
    >
      {items.map(item => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            data-tab={item.key}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.key)}
            className={clsx(
              "text-tau-body relative inline-flex items-center gap-1.5 pb-[7px] pt-1",
              "ease-tau-out transition-colors duration-[160ms]",
              "after:bg-accent after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full",
              active
                ? "text-ink-1 font-semibold after:opacity-100"
                : "text-ink-2 hover:text-ink-1 after:opacity-0"
            )}
          >
            {item.label}
            {item.badge ? (
              <span className="bg-warn-soft text-warn text-tau-tiny rounded-full px-1.5 font-medium">
                {item.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
