/**
 * 洞见视图里画在原文片段上的标记（编辑器 leafWrapper）：装饰层带来的 insightId / insightKind / insightOrder
 * 决定线型与画线动画的先后；当前选中的那一处由 context 提供。leafWrapper 对每个叶子都会调用，
 * 没有洞见装饰的叶子原样返回。
 */

import { createContext, useContext, type ReactNode } from "react";
import type { Text } from "slate";
import { cn } from "@tau/ui";
import type { InsightRangeProps } from "../anchors";

export const InsightCurrentContext = createContext<string | null>(null);

/** 每处之间的画线间隔 */
export const DRAW_STAGGER_MS = 250;

const KIND_CLASS: Record<InsightRangeProps["insightKind"], string> = {
  // 蓝色细实线从左往右画出
  link: "bg-[linear-gradient(var(--tau-info),var(--tau-info))] bg-[length:100%_2px] bg-[position:0_100%] bg-no-repeat animate-insight-draw",
  // 灰色点线
  dup: "underline decoration-ink-3 decoration-dotted decoration-2 underline-offset-[5px] animate-insight-line",
  // 红色波浪线
  conflict:
    "underline decoration-danger decoration-wavy decoration-1 underline-offset-[5px] animate-insight-line",
  gap: "",
};

export function InsightLeaf({ leaf, children }: { leaf: Readonly<Text>; children: ReactNode }) {
  const current = useContext(InsightCurrentContext);
  const props = leaf as Readonly<Text> & Partial<InsightRangeProps>;
  if (!props.insightId || !props.insightKind) return <>{children}</>;
  return (
    <span
      data-insight-mark={props.insightId}
      className={cn(
        "hover:bg-accent-soft cursor-pointer rounded-[3px] transition-colors duration-150",
        KIND_CLASS[props.insightKind],
        current === props.insightId && "bg-accent-soft"
      )}
      style={{ animationDelay: `${120 + (props.insightOrder ?? 0) * DRAW_STAGGER_MS}ms` }}
    >
      {children}
    </span>
  );
}
