/**
 * 状态签 —— 淡墨底 + 语义色点（发布页 chip 同款）：颜色只落在点上，文字保持中性。
 */

import type { ReactNode } from "react";
import clsx from "clsx";

const DOT_TONES = {
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  accent: "bg-accent",
  neutral: "bg-ink-3",
} as const;

export function StatusChip({
  tone = "neutral",
  children,
  className,
}: {
  tone?: keyof typeof DOT_TONES;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "bg-hover text-ink-2 text-tau-micro inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-px",
        className
      )}
    >
      <span className={clsx("size-1.5 rounded-full", DOT_TONES[tone])} />
      {children}
    </span>
  );
}
