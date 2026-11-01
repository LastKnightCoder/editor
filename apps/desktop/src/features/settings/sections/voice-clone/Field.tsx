/** 音色复刻面板的字段：12px 淡墨标签（可带提示与右侧动作），控件在下 */

import type { ReactNode } from "react";
import { cn } from "@tau/ui";

export const Field = ({
  label,
  hint,
  action,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <div className={cn("flex min-w-0 flex-col gap-3", className)}>
    <div className="flex min-h-[18px] items-center gap-2">
      <span className="text-ink-2 text-[12px]">{label}</span>
      {hint && <span className="text-ink-3 text-[11.5px] tabular-nums">{hint}</span>}
      <span className="flex-1" />
      {action}
    </div>
    {children}
  </div>
);
