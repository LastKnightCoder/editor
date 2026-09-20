/**
 * Tag —— 值展示标签（A+B 结合 II「点 + 软底」，mockups/tag/plan-ab-dot-soft.html，
 * 2026-09-19 定稿）。
 *
 * soft 底 + 同系 solid 文字（B 的色块扫读）+ 可选 solid 色点（A 的色相焦点）：
 * 三层同色阶，Notion select 选项标签语感。无色 = 无分类——默认 gray 走
 * group 底 + ink-2 文字且恒无点。纯展示 span：非交互、无命中要求；
 * onRemove 数据驱动显 ×（button + aria-label，伪元素把热区扩到 24、
 * focus-visible 才显 ring、点击不冒泡——表格行点击不受牵连）。
 *
 * 单尺寸（高 22、字 tau-sm）无档；长文本 truncate 由容器约束 max-width。
 */

import { X } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "../cn";

export const TAG_COLORS = ["red", "orange", "yellow", "green", "gray", "blue", "purple"] as const;
export type TagColor = (typeof TAG_COLORS)[number];

/** 底+文字与点分两个语义位：orange 的文字走 accent-text、点走 accent */
const TAG_STYLES: Record<TagColor, { shell: string; dot: string }> = {
  red: { shell: "bg-danger-soft text-danger", dot: "bg-danger" },
  orange: { shell: "bg-accent-soft text-accent-text", dot: "bg-accent" },
  yellow: { shell: "bg-warn-soft text-warn", dot: "bg-warn" },
  green: { shell: "bg-ok-soft text-ok", dot: "bg-ok" },
  // gray = 无分类：surface 亮底 + line-1 描边（D-009 行内药丸口径——白卡上同底靠描边显形）
  gray: { shell: "border-line-1 bg-surface text-ink-2 border", dot: "" },
  blue: { shell: "bg-info-soft text-info", dot: "bg-info" },
  purple: { shell: "bg-tag-3-soft text-tag-3", dot: "bg-tag-3" },
};

export interface TagProps extends Omit<ComponentProps<"span">, "color"> {
  /** 分类色（7 色板，与 ColorSwatch 同源）；语义状态复用色板，不另设 status */
  color?: TagColor;
  /** 色相焦点（默认开）；gray 恒无点——无色 = 无分类 */
  showDot?: boolean;
  /** 传了才渲染移除钮 ×（热区 24，点击不冒泡） */
  onRemove?: () => void;
}

export function Tag({
  color = "gray",
  showDot = true,
  onRemove,
  className,
  children,
  ...props
}: TagProps) {
  const { shell, dot } = TAG_STYLES[color];
  const withDot = showDot && color !== "gray";

  return (
    <span
      {...props}
      className={cn(
        "text-tau-sm inline-flex h-[22px] max-w-full items-center gap-1.5 rounded-full px-[9px] leading-none",
        shell,
        className
      )}
    >
      {withDot && <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", dot)} />}
      <span className="truncate">{children}</span>
      {onRemove && (
        <button
          type="button"
          aria-label="移除"
          onClick={event => {
            event.stopPropagation();
            onRemove();
          }}
          className={cn(
            "relative grid size-4 shrink-0 cursor-pointer place-items-center rounded-full",
            "hover:bg-press opacity-75 outline-none transition-opacity hover:opacity-100",
            "focus-visible:shadow-[var(--tau-focus-ring)]",
            // 伪元素外扩把热区撑到 24（视觉 16 不撑破 22px 药丸）
            "before:absolute before:-inset-2 before:content-['']"
          )}
        >
          <X aria-hidden className="size-[11px]" strokeWidth={2} />
        </button>
      )}
    </span>
  );
}
