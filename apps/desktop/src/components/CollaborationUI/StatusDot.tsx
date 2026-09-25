/** 会话状态点（颜色与会话状态 tone 一一对应） */

import type { SessionTone } from "@tau/collaboration/src/view";
import { cn } from "@tau/ui";

const DOT_TONES: Record<SessionTone, string> = {
  live: "bg-ok",
  syncing: "bg-warn animate-pulse motion-reduce:animate-none",
  offline: "bg-ink-3",
  error: "bg-danger",
  idle: "shadow-[inset_0_0_0_1.5px_var(--tau-ink-3)]",
};

export function StatusDot({
  tone = "idle",
  className,
}: {
  tone?: SessionTone;
  className?: string;
}) {
  return (
    <i
      aria-hidden
      className={cn("size-[7px] flex-none rounded-full", DOT_TONES[tone], className)}
    />
  );
}
