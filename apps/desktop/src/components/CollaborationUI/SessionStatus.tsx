/** 状态点 + 文案（瞬时「正在同步」延迟揭示，打字时不闪） */

import type { CollaborationSession } from "@tau/collaboration";
import { sessionStatus, useStableSessionStatus } from "@tau/collaboration/src/view";
import { cn } from "@tau/ui";
import { StatusDot } from "./StatusDot";

export function SessionStatus({
  session,
  suffix,
  className,
}: {
  session: CollaborationSession;
  /** 连接正常时追加在文案后（如「· 2 人正在编辑」） */
  suffix?: string;
  className?: string;
}) {
  const status = useStableSessionStatus(session) ?? sessionStatus(session);
  return (
    <span
      className={cn(
        "text-tau-sm inline-flex min-w-0 items-center gap-1.5",
        status.tone === "error" ? "text-danger" : "text-ink-2",
        className
      )}
    >
      <StatusDot tone={status.tone} />
      <span className="truncate">
        {status.label}
        {suffix && status.tone === "live" ? ` · ${suffix}` : ""}
      </span>
    </span>
  );
}
