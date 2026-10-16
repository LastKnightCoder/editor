import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@tau/ui";

export type NoticeTone = "info" | "warn" | "danger" | "ok";

const TONES: Record<NoticeTone, { shell: string; icon: string; Icon: LucideIcon }> = {
  info: { shell: "bg-info-soft", icon: "text-info", Icon: Info },
  warn: { shell: "bg-warn-soft", icon: "text-warn", Icon: TriangleAlert },
  danger: { shell: "bg-danger-soft", icon: "text-danger", Icon: CircleAlert },
  ok: { shell: "bg-ok-soft", icon: "text-ok", Icon: CircleCheck },
};

/** 行内提示条：标题 + 说明 + 右侧动作 */
export function Notice({
  tone,
  title,
  children,
  actions,
  className,
}: {
  tone: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const { shell, icon, Icon } = TONES[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "rounded-tau-md flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3",
        shell,
        className
      )}
    >
      <Icon size={16} strokeWidth={1.9} className={cn("mt-[3px] shrink-0", icon)} />
      <div className="text-tau-sm text-ink-1 min-w-0 flex-1 leading-[1.6]">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-ink-2">{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
