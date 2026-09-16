/**
 * 加载态 —— Spinner 圆环 + 页面级居中版式（02 §5.1 词表的 Spinner 归位）。
 * Spinner 可单独行内使用；Loading 铺满父容器居中（无高度链时 min-h 兜底）。
 */

import clsx from "clsx";
import type { ComponentProps } from "react";

export function Spinner({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      className={clsx(
        "border-accent/30 border-t-accent inline-block size-4 animate-spin rounded-full border-2",
        className
      )}
      {...props}
    />
  );
}

export function Loading({ label = "加载中…", className }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={clsx(
        "flex h-full min-h-[45vh] flex-col items-center justify-center gap-3",
        className
      )}
    >
      <Spinner className="size-5" />
      <p className="text-tau-sm text-ink-3">{label}</p>
    </div>
  );
}
