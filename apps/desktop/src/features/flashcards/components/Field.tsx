import { cn } from "@tau/ui";
import type { ReactNode } from "react";
const LABEL = "text-ink-2 text-[12px] font-medium";

export function Field({
  label,
  aux,
  action,
  children,
}: {
  label: string;
  aux?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className={LABEL}>{label}</span>
        {aux && <span className="text-ink-3 ml-auto truncate text-[11.5px]">{aux}</span>}
        {action && <span className={cn(!aux && "ml-auto")}>{action}</span>}
      </div>
      {children}
    </div>
  );
}
