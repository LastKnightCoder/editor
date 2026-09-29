/**
 * 筛选 pill：页面工具栏里的单选筛选项（分类 / 来源 / 状态 / 卡组），可带图标与计数。
 * 选中 = selected 底 + accent 字；未选有两种皮肤：outline = line-1 描边，raised = surface 底 + 卡片投影。
 * 选中与否由调用方受控，本组件只报点击；className 经 cn 合并，可覆盖未选中的文字色（如警示）。
 */

import type { ReactNode } from "react";
import { cn } from "../cn";

export interface FilterPillProps {
  active: boolean;
  onClick(): void;
  label: string;
  /** 不传即不渲染 */
  count?: number;
  /** 标签前的图标（调用方自定尺寸与间距） */
  icon?: ReactNode;
  /** 未选中的皮肤，默认 outline */
  variant?: "outline" | "raised";
  className?: string;
}

export function FilterPill({
  active,
  onClick,
  label,
  count,
  icon,
  variant = "outline",
  className,
}: FilterPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "ease-tau-out flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[12px] outline-none transition-[background,color] duration-150 focus-visible:shadow-[var(--tau-focus-ring)]",
        active
          ? cn(
              "bg-selected text-accent-text font-medium",
              variant === "outline" && "border border-transparent"
            )
          : variant === "outline"
            ? "border-line-1 text-ink-2 hover:bg-hover hover:text-ink-1 border"
            : "bg-surface shadow-card text-ink-2 hover:text-ink-1",
        className
      )}
    >
      {icon}
      {label}
      {count !== undefined && (
        <span className={cn("text-[10.5px] tabular-nums", active ? "opacity-75" : "text-ink-3")}>
          {count}
        </span>
      )}
    </button>
  );
}
