/**
 * 白板协作的展示层纯函数：把本机保存状态与远端同步状态合成一行状态。
 * 本机保存成功只说「已保存在本机」，只有远端确认覆盖了本机修订才说「已同步」。
 */

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
const PENDING_LABELS: Record<WhiteboardPendingKind, string> = {
  publication: "共享没有完成，白板暂停编辑，内容完好保存在本机",
  unshare: "退出共享尚未完成，白板暂停编辑，请继续完成原操作",
};

export function whiteboardSyncStatus(
  local: WhiteboardSaveState,
  remote?: WhiteboardRemoteState,
  pending?: WhiteboardPendingKind
): WhiteboardSyncStatus {
  if (pending) return { label: PENDING_LABELS[pending], tone: "syncing" };
  if (local.error)
    return {
      label: `白板保存未完成，内容已保留：${local.error}`,
      tone: "error",
      actions: ["retry-save"],
    };
  if (local.phase !== "saved" || local.pending > 0)
    return { label: "正在保存到本机…", tone: "syncing", transientSyncing: true };
  if (!remote) return { label: "已保存在本机", tone: "idle" };
  switch (remote.phase) {
    case "checking":
      return { label: "已保存在本机，正在读取共享状态…", tone: "syncing" };
    case "local":
      return { label: "已保存在本机", tone: "idle" };
    case "connecting":
      return { label: "已保存在本机，正在连接协作服务…", tone: "syncing" };
    case "syncing":
      return { label: "已保存在本机，正在同步…", tone: "syncing", transientSyncing: true };
    case "synced":
      return remote.unsynced
        ? { label: "已保存在本机，正在同步…", tone: "syncing", transientSyncing: true }
        : { label: "已同步", tone: "live" };
    case "waiting":
      return {
        label: remote.message ?? "已保存在本机，等待协作端确认之前的改动…",
        tone: "syncing",
        actions: ["retry"],
      };
    case "offline":
      return remote.unsynced
        ? { label: "离线，改动已存本机，恢复连接后自动同步", tone: "syncing", actions: ["retry"] }
        : { label: "离线", tone: "offline", actions: ["retry"] };
    case "forbidden":
      return {
        label: "已保存在本机，未同步：你已没有这块白板的协作权限",
        tone: "error",
        actions: ["retry", "detach"],
      };
    case "closed":
      return {
        label: "已保存在本机，未同步：这块白板的共享已结束",
        tone: "idle",
        actions: ["detach"],
      };
    case "incompatible":
      return {
        label: "已保存在本机，未同步：协作端需要更新版本的应用，请升级后再同步",
        tone: "error",
        actions: ["retry"],
      };
    case "rebind":
      return {
        label: "协作端白板基线已变化，同步已暂停",
        tone: "syncing",
        actions: ["detach"],
      };
    case "rejected":
      return {
        label: "协作端没有接受部分改动，同步已暂停",
        tone: "error",
        actions: ["detach"],
      };
    default:
      return {
        label: `已保存在本机，同步未完成：${remote.message ?? "请稍后重试"}`,
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
