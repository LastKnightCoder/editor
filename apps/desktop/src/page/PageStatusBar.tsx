/**
 * PageStatusBar —— 页面自带的底部状态栏（壳层不再提供全局状态栏）。
 *
 * 需要状态栏的页面在自身布局底部渲染本组件（页面根 flex-col，滚动区 flex-1），
 * 不需要的页面什么都不放，窗口底部就不会留一条空壳。只统一高度与字号，
 * 内容与左右对齐由页面决定。
 */

import type { ReactNode } from "react";
import { cn } from "@tau/ui";

export function PageStatusBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <footer
      className={cn(
        "text-tau-micro text-ink-3 flex h-[var(--tau-statusbar-h)] shrink-0 select-none items-center px-3.5",
        className
      )}
    >
      {children}
    </footer>
  );
}
