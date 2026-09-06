import { useEffect, useState } from "react";
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

/** 连接正常时的瞬时“正在同步”需持续超过该时长才切换显示 */
const TRANSIENT_SYNCING_DELAY_MS = 1000;

export function useStableSessionStatus(session: CollaborationSession): SessionStatus;
export function useStableSessionStatus(session?: CollaborationSession): SessionStatus | undefined;
/**
 * 展示用会话状态：打字时 pending 在毫秒级反复翻转，直接渲染会让
 * “已同步”徽章高频闪烁，因此对连接正常时的瞬时“正在同步”延迟揭示。
 */
export function useStableSessionStatus(session?: CollaborationSession): SessionStatus | undefined {
  const status = session ? sessionStatus(session) : undefined;
  const [displayed, setDisplayed] = useState<SessionStatus | undefined>(status);
  useEffect(() => {
    const transientSyncing = Boolean(
      session &&
      status &&
      status.tone === "syncing" &&
      session.connection === "connected" &&
      session.status === "active" &&
      !session.leaving
    );
    const reveal = () =>
      setDisplayed(previous =>
        previous?.label === status?.label && previous?.tone === status?.tone ? previous : status
      );
    if (!transientSyncing) {
      reveal();
      return;
    }
    const timer = setTimeout(reveal, TRANSIENT_SYNCING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status, session]);
  // displayed 是延迟揭示的展示值，session 首次出现的那一帧仍是旧值（undefined），
  // 此时回退到当前 status，避免调用方在 session 已存在时读到 undefined（status!.tone 崩溃）。
  return displayed ?? status;
}
