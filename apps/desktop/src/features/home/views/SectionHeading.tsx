/**
 * 首页「回顾」一组面板的标题：小号字标 + 细分隔线，右端挂时间窗与面板菜单。
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
