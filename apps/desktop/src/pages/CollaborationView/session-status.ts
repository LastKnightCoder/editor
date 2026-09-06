import type { CollaborationSession } from "@tau/collaboration";
import type { StatusTone } from "@/components/CollaborationUI";

export interface SessionStatus {
  label: string;
  tone: StatusTone;
}

export function sessionStatus(session: CollaborationSession): SessionStatus {
  if (session.error) return { label: session.error, tone: "error" };
  if (session.leaving) return { label: "等待退出完成", tone: "syncing" };
  if (session.status === "closed")
    return session.pending
      ? { label: "共享已结束，有待恢复内容", tone: "syncing" }
      : { label: "共享已结束", tone: "idle" };
  if (session.connection === "connected")
    return session.pending
      ? { label: "正在同步", tone: "syncing" }
      : { label: "已同步", tone: "live" };
  return session.pending
    ? { label: "离线，改动已存本机", tone: "syncing" }
    : { label: "离线", tone: "offline" };
}

export function sessionStatusLabel(session: CollaborationSession) {
  return sessionStatus(session).label;
}
