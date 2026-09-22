/**
 * 限高渐隐容器：内容溢出限高时底部一行渐隐（mask 方案，主题无关），未溢出
 * 则原样显示。除自身外还观察首个子元素——容器被 max-h 钉住时子内容长高不
 * 改变自身尺寸，仅观察自身会漏检。渐变类 .cards-fade-bottom 见域内 cards.css。
 */

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@tau/ui";

export function FadeWhenOverflow({
  className,
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [faded, setFaded] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    const inner = el?.firstElementChild;
    if (!el || !inner) return;
    const check = () => setFaded(el.scrollHeight > el.clientHeight + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={style}
      className={cn("overflow-hidden", faded && "cards-fade-bottom", className)}
    >
      {children}
    </div>
  );
}
