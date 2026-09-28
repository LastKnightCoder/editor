/**
 * 今日页分段标题（今天 / 继续 / 回顾）：小号字标 + 细分隔线，右端可挂段内控件（如回顾的时间窗）。
 */

import clsx from "clsx";
import type { ReactNode } from "react";

export function SectionHeading({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={clsx("flex items-center gap-3", className)}>
      <h2 className="text-tau-micro text-ink-3 m-0 font-medium tracking-[0.12em]">{title}</h2>
      <span className="bg-line-1 h-px flex-1" />
      {children}
    </div>
  );
}
