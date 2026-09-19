/**
 * 加载态 —— Spinner 圆环 + 页面级居中版式（02 §5.1 词表的 Spinner 归位）。
 * Spinner 可单独行内使用；Loading 铺满父容器居中。
 *
 * 兜底高度走 prop（inline style）而非 Tailwind 类（2026-09-17 修正）：原实现把
 * `min-h-[45vh]` 写死在基础类里，调用方传 `className="min-h-0"` 会被它压掉——
 * 同名 utility 的胜负由 Tailwind 生成顺序决定，**不由 class 书写顺序决定**，所以
 * 那个覆盖一直是静默失效的（样板间把 Loading 放进 168px 演示框时内容被裁空，
 * 才暴露出这个潜在缺陷）。改成 prop 后 inline style 可靠压过任意类。
 */

import type { ComponentProps } from "react";
import { cn } from "../cn";

export function Spinner({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      className={cn(
        "border-accent/30 border-t-accent inline-block size-4 animate-spin rounded-full border-2",
        className
      )}
      {...props}
    />
  );
}

export function Loading({
  label = "加载中…",
  className,
  minHeight = "45vh",
}: {
  label?: string;
  className?: string;
  /** 无高度链时的兜底最小高度（默认 45vh）；调用方自带高度时传 0 关闭 */
  minHeight?: number | string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{ minHeight }}
      className={cn("flex h-full flex-col items-center justify-center gap-3", className)}
    >
      <Spinner className="size-5" />
      <p className="text-tau-sm text-ink-3">{label}</p>
    </div>
  );
}
