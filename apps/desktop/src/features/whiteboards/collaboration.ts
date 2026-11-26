/**
 * 白板协作的展示层纯函数：把本机保存状态与远端同步状态合成一行状态。
 * 本机保存成功只说「已保存在本机」，只有远端确认覆盖了本机修订才说「已同步」。
 */

import type { WhiteboardChromeTranslator } from "./i18n-chrome";
import type { SessionStatus } from "@tau/collaboration/src/view";
import type { CollaborationSession, SharedWhiteboardInfo } from "@tau/collaboration";
import type { WhiteboardSaveState } from "@/services/whiteboard-documents/client";
import type { WhiteboardRemoteState } from "@/services/whiteboard-documents/remote";

/** retry-save/retry 重试；detach 转为本机白板。 */
export type WhiteboardSyncAction = "retry-save" | "retry" | "detach";
export interface WhiteboardSyncStatus extends SessionStatus {
  actions?: WhiteboardSyncAction[];
}
/** 已固定、尚未完成的操作：白板在此期间暂停编辑，只能按原操作继续或取消。 */
export type WhiteboardPendingKind = "publication" | "unshare";
export function whiteboardSyncStatus(
  local: WhiteboardSaveState,
  t: WhiteboardChromeTranslator["t"],
  remote?: WhiteboardRemoteState,
  pending?: WhiteboardPendingKind
): WhiteboardSyncStatus {
  if (pending)
    return {
      label: t(pending === "publication" ? "chrome.status.publication" : "chrome.status.unshare"),
      tone: "syncing",
    };
  if (local.error)
    return {
      label: t("chrome.status.saveFailed", { reason: local.error }),
      tone: "error",
      actions: ["retry-save"],
    };
  if (local.phase !== "saved" || local.pending > 0)
    return { label: t("chrome.status.saving"), tone: "syncing", transientSyncing: true };
  if (!remote) return { label: t("chrome.status.saved"), tone: "idle" };
  switch (remote.phase) {
    case "checking":
      return { label: t("chrome.status.checking"), tone: "syncing" };
    case "local":
      return { label: t("chrome.status.saved"), tone: "idle" };
    case "connecting":
      return { label: t("chrome.status.connecting"), tone: "syncing" };
    case "syncing":
      return { label: t("chrome.status.syncing"), tone: "syncing", transientSyncing: true };
    case "synced":
      return remote.unsynced
        ? { label: t("chrome.status.syncing"), tone: "syncing", transientSyncing: true }
        : { label: t("chrome.status.synced"), tone: "live" };
    case "waiting":
      return {
        label: remote.message ?? t("chrome.status.waiting"),
        tone: "syncing",
        actions: ["retry"],
      };
    case "offline":
      return remote.unsynced
        ? { label: t("chrome.status.offlinePending"), tone: "syncing", actions: ["retry"] }
        : { label: t("chrome.status.offline"), tone: "offline", actions: ["retry"] };
    case "forbidden":
      return {
        label: t("chrome.status.forbidden"),
        tone: "error",
        actions: ["retry", "detach"],
      };
    case "closed":
      return {
        label: t("chrome.status.closed"),
        tone: "idle",
        actions: ["detach"],
      };
    case "incompatible":
      return {
        label: t("chrome.status.incompatible"),
        tone: "error",
        actions: ["retry"],
      };
    case "rejected":
      return {
        label: t("chrome.status.rejected"),
        tone: "error",
        actions: ["detach"],
      };
    default:
      return {
        label: t("chrome.status.failed", { reason: remote.message ?? t("chrome.status.retry") }),
        tone: "error",
        actions: ["retry"],
      };
  }
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
