import { useState, type ReactNode, type RefObject } from "react";
import clsx from "clsx";
import { useEdgeFade } from "@tau/ui";
import { FADE_SCROLL_CLASS } from "./fadeScrollClass";

interface FadeScrollProps {
  className?: string;
  children?: ReactNode;
  /** 虚拟列表需要拿到滚动容器（getScrollElement） */
  scrollRef?: RefObject<HTMLDivElement | null>;
}

/**
 * 面板内的纵向滚动区：接 edge fade（对齐壳层 useEdgeFade 协议），只在可滚方向渐隐，
 * 内容不贴着面板边缘被硬切；滚动条内缩不贴右缘。右侧 6px 透明边算在宽度里，
 * 调用方右内边距相应减 6px。
 */
export function FadeScroll({ className, children, scrollRef }: FadeScrollProps) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(el);
  return (
    <div
      ref={node => {
        setEl(node);
        if (scrollRef) scrollRef.current = node;
      }}
      className={clsx(FADE_SCROLL_CLASS, className)}
    >
      {children}
    </div>
  );
}
