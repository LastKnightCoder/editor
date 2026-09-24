import { useState, type ReactNode, type RefObject } from "react";
import clsx from "clsx";
import { useEdgeFade } from "@tau/ui";

interface FadeScrollProps {
  className?: string;
  children?: ReactNode;
  /** 虚拟列表需要拿到滚动容器（getScrollElement） */
  scrollRef?: RefObject<HTMLDivElement | null>;
}

/**
 * 选择器内的纵向滚动区：接 edge fade（对齐壳层 useEdgeFade 协议），
 * 可滚方向渐隐提示，内容不再贴着面板边缘被硬切。
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
      className={clsx(
        // 滚动条内缩：4px 细条 + 右侧 6px 透明边 + 轨道上下各 10px，不贴容器边缘。
        // 不用 .scrollbar-inset：它是未分层 CSS，其 4px 轨道边会压过这里的工具类
        "edge-fade-scroll overflow-y-auto border-r-[6px] border-r-transparent",
        "[&::-webkit-scrollbar-thumb]:rounded-[2px] [&::-webkit-scrollbar]:w-1",
        "[&::-webkit-scrollbar-track]:border-y-[10px] [&::-webkit-scrollbar-track]:border-transparent",
        className
      )}
    >
      {children}
    </div>
  );
}
