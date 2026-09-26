/**
 * 面板（白卡）族 —— 壳层内容区的基础卡片容器（A2 视觉：surface 底 + shadow-card）。
 * pad 三档：base（宽松版式 18/20）、compact（今日页紧凑版式 12/16）、none（自管内距）。
 * variant：raised（默认，阴影白卡，直接落在 page 底上）/ outline（细描边，落在一整张纸上——纸上再叠阴影卡会糊成一片）。
 * PanelTitle 的下间距由调用方按域密度给（mb-1.5 / mb-2.5），避免同属性类层叠不可控。
 */

import type { ComponentProps } from "react";
import { cn } from "../cn";

const PANEL_VARIANTS = {
  raised: "shadow-card",
  outline: "border border-line-1",
} as const;

const PANEL_PADS = {
  base: "px-5 py-[18px]",
  compact: "px-4 py-3",
  none: "",
} as const;

export function Panel({
  className,
  pad = "base",
  variant = "raised",
  ...props
}: ComponentProps<"section"> & {
  pad?: keyof typeof PANEL_PADS;
  variant?: keyof typeof PANEL_VARIANTS;
}) {
  return (
    <section
      className={cn(
        "rounded-tau-lg bg-surface",
        PANEL_VARIANTS[variant],
        PANEL_PADS[pad],
        className
      )}
      {...props}
    />
  );
}

export function PanelTitle({ className, ...props }: ComponentProps<"h2">) {
  return (
    <h2
      className={cn("text-tau-body text-ink-1 flex items-center gap-2 font-semibold", className)}
      {...props}
    />
  );
}

/** 标题行右侧的说明小字（flex 布局下与标题的间距由 gap 提供） */
export function PanelNote({ className, ...props }: ComponentProps<"small">) {
  return <small className={cn("text-tau-micro text-ink-3 font-normal", className)} {...props} />;
}

/** 板内空态注记（描边行，替代原 board-note 空态用法） */
export function EmptyNote({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "rounded-tau-sm border-line-1 text-tau-sm text-ink-2 mt-2.5 border px-3 py-2.5 leading-[1.6]",
        className
      )}
      {...props}
    />
  );
}

/** 标题行右侧的“前往”链接（无背景，贴卡片右缘，与标题同行对齐）—— 今日页 / 发布页等共用 */
export function PanelAction({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "-mr-1 ml-auto inline-flex cursor-pointer items-center gap-0.5 rounded-[7px] px-1 py-0.5",
        "text-tau-micro text-ink-3 font-normal",
        "ease-tau-out hover:bg-hover hover:text-ink-1 transition-[background,color] duration-[160ms]",
        className
      )}
      {...props}
    />
  );
}
