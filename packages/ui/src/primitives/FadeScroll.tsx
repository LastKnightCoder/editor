import { useCallback, useState, type ReactNode, type Ref } from "react";
import { motion } from "motion/react";
import { cn } from "../cn";
import { FADE_SCROLL_CLASS, useEdgeFade } from "../hooks";

interface FadeScrollProps {
  className?: string;
  children?: ReactNode;
  /** 需要拿到滚动容器时用（虚拟列表的 getScrollElement、滚动监听）；对象 ref 或回调 ref */
  scrollRef?: Ref<HTMLDivElement | null>;
  /** 内部有 motion 布局动画时开启：渲染为 motion.div 并声明 layoutScroll，动画按滚动偏移校正 */
  layoutScroll?: boolean;
  /** 关掉顶部渐隐（默认开）：滚动区顶部紧邻实底工具栏时，渐隐带落在实底上只会显脏 */
  topFade?: boolean;
}

/**
 * 面板内的纵向滚动区：接 edge fade（对齐壳层 useEdgeFade 协议），只在可滚方向渐隐，
 * 内容不贴着面板边缘被硬切；滚动条内缩不贴右缘。右侧 6px 透明边算在宽度里，
 * 调用方右内边距相应减 6px；类名经 cn 合并，调用方可覆盖透明边宽度（如 border-r-[3px]）。
 */
export function FadeScroll({
  className,
  children,
  scrollRef,
  layoutScroll,
  topFade = true,
}: FadeScrollProps) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(el, { top: topFade });
  /* ref 回调必须稳定：内联函数每次渲染都是新引用，React 会先以 null 调旧回调、再以节点调新回调；
     scrollRef 若是父组件的 setState，这一对调用会让父组件重渲染 → 又生成新回调 → 无限循环 */
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      setEl(node);
      if (typeof scrollRef === "function") scrollRef(node);
      else if (scrollRef) scrollRef.current = node;
    },
    [scrollRef]
  );
  const Container = layoutScroll ? motion.div : "div";
  return (
    <Container
      // 普通 div 不能收到 layoutScroll（值为 undefined 也会触发 React 未知属性告警）
      {...(layoutScroll ? { layoutScroll: true } : {})}
      ref={setRef}
      className={cn(FADE_SCROLL_CLASS, className)}
    >
      {children}
    </Container>
  );
}
