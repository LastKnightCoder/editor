/**
 * 白板协作的展示层纯函数：把本机保存状态与远端同步状态合成一行状态。
 * 本机保存成功只说「已保存在本机」，只有远端确认覆盖了本机修订才说「已同步」。
 */

import type { WhiteboardChromeTranslator } from "./i18n-chrome";
import type { SessionTone } from "@tau/collaboration/src/view";
import type { CollaborationSession, SharedWhiteboardInfo } from "@tau/collaboration";
import type { WhiteboardSaveState } from "@/services/whiteboard-documents/client";
import type { WhiteboardRemoteState } from "@/services/whiteboard-documents/remote";

/** retry-save/retry 重试；detach 转为本机白板。 */
export type WhiteboardSyncAction = "retry-save" | "retry" | "detach";
export type WhiteboardSyncKind =
  | "publication"
  | "unshare"
  | "saveFailed"
  | "saving"
  | "saved"
  | "checking"
  | "connecting"
  | "syncing"
  | "synced"
  | "waiting"
  | "offlinePending"
  | "offline"
  | "forbidden"
  | "closed"
  | "incompatible"
  | "rejected"
  | "failed";
export interface WhiteboardSyncStatus {
  kind: WhiteboardSyncKind;
  reason?: string;
  tone: SessionTone;
  transientSyncing?: boolean;
  actions?: WhiteboardSyncAction[];
}
/** 已固定、尚未完成的操作：白板在此期间暂停编辑，只能按原操作继续或取消。 */
export type WhiteboardPendingKind = "publication" | "unshare";
export function whiteboardSyncStatus(
  local: WhiteboardSaveState,
  remote?: WhiteboardRemoteState,
  pending?: WhiteboardPendingKind
): WhiteboardSyncStatus {
  if (pending)
    return {
      kind: pending,
      tone: "syncing",
    };
  if (local.error)
    return {
      kind: "saveFailed",
      reason: local.error,
      tone: "error",
      actions: ["retry-save"],
    };
  if (local.phase !== "saved" || local.pending > 0)
    return { kind: "saving", tone: "syncing", transientSyncing: true };
  if (!remote) return { kind: "saved", tone: "idle" };
  switch (remote.phase) {
    case "checking":
      return { kind: "checking", tone: "syncing" };
    case "local":
      return { kind: "saved", tone: "idle" };
    case "connecting":
      return { kind: "connecting", tone: "syncing" };
    case "syncing":
      return { kind: "syncing", tone: "syncing", transientSyncing: true };
    case "synced":
      return remote.unsynced
        ? { kind: "syncing", tone: "syncing", transientSyncing: true }
        : { kind: "synced", tone: "live" };
    case "waiting":
      return {
        kind: "waiting",
        reason: remote.message,
        tone: "syncing",
        actions: ["retry"],
      };
    case "offline":
      return remote.unsynced
        ? { kind: "offlinePending", tone: "syncing", actions: ["retry"] }
        : { kind: "offline", tone: "offline", actions: ["retry"] };
    case "forbidden":
      return {
        kind: "forbidden",
        tone: "error",
        actions: ["retry", "detach"],
      };
    case "closed":
      return {
        kind: "closed",
        tone: "idle",
        actions: ["detach"],
      };
    case "incompatible":
      return {
        kind: "incompatible",
        tone: "error",
        actions: ["retry"],
      };
    case "rejected":
      return {
        kind: "rejected",
        tone: "error",
        actions: ["detach"],
      };
    default:
      return {
        kind: "failed",
        reason: remote.message,
        tone: "error",
        actions: ["retry"],
      };
  }
}

export function whiteboardStatusText(
  status: WhiteboardSyncStatus,
  t: WhiteboardChromeTranslator["t"]
): string {
  if (status.kind === "waiting") return status.reason ?? t("chrome.status.waiting");
  if (status.kind === "saveFailed")
    return t("chrome.status.saveFailed", { reason: status.reason ?? "" });
  if (status.kind === "failed")
    return t("chrome.status.failed", { reason: status.reason ?? t("chrome.status.retry") });
  return t(`chrome.status.${status.kind}`);
}

/** 协作码、成员列表沿用正文协作的面板，白板房间按同一会话形状呈现。 */
export function whiteboardSession(
  room: SharedWhiteboardInfo,
  remote?: WhiteboardRemoteState
): CollaborationSession {
  return {
    ...room,
    connection:
      remote?.phase === "synced" || remote?.phase === "syncing"
        ? "connected"
        : remote?.phase === "offline"
          ? "offline"
          : remote?.phase === "connecting" || !remote
            ? "connecting"
            : "error",
    pending: Boolean(remote?.unsynced),
    leaving: false,
  };
}
