/**
 * 面板（白卡）族 —— 壳层内容区的基础卡片容器（A2 视觉：surface 底 + shadow-card）。
 * pad 三档：base（统计页等宽松版式 18/20）、compact（首页紧凑版式 12/16）、none（自管内距）。
 * PanelTitle 的下间距由调用方按域密度给（mb-1.5 / mb-2.5），避免同属性类层叠不可控。
 */

import type { ComponentProps } from "react";
import { cn } from "../cn";

const PANEL_PADS = {
  base: "px-5 py-[18px]",
  compact: "px-4 py-3",
  none: "",
} as const;

export function Panel({
  className,
  pad = "base",
  ...props
}: ComponentProps<"section"> & { pad?: keyof typeof PANEL_PADS }) {
  return (
    <section
      className={cn("rounded-tau-lg bg-surface shadow-card", PANEL_PADS[pad], className)}
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

/** 板内空态注记（灰底行，替代原 board-note 空态用法） */
export function EmptyNote({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "rounded-tau-sm bg-group text-tau-sm text-ink-2 mt-2.5 px-3 py-2.5 leading-[1.6]",
        className
      )}
      {...props}
    />
  );
}

/** 标题行右侧的“前往”链接（无背景，贴卡片右缘，与标题同行对齐）—— home/stats 共用 */
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
