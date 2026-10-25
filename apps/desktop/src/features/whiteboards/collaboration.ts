/**
 * 白板协作的展示层纯函数：把本机保存状态与远端同步状态合成一行状态。
 * 本机保存成功只说「已保存在本机」，只有远端确认覆盖了本机修订才说「已同步」。
 */

import type { SessionStatus } from "@tau/collaboration/src/view";
import type {
  CollaborationSession,
  SharedWhiteboardInfo,
  WhiteboardElementSnapshot,
  WhiteboardModel,
} from "@tau/collaboration";
import type { WhiteboardContractCatalog } from "@tau/whiteboard/collaboration";
import type { WhiteboardSaveState } from "@/services/whiteboard-documents/client";
import type { WhiteboardRemoteState } from "@/services/whiteboard-documents/remote";

/** retry-save/retry 重试；adopt 采用新版本；rebuild 用协作端版本重建；detach 转为本机白板。 */
export type WhiteboardSyncAction = "retry-save" | "retry" | "adopt" | "rebuild" | "detach";
export interface WhiteboardSyncStatus extends SessionStatus {
  actions?: WhiteboardSyncAction[];
}
/** 已固定、尚未完成的操作：白板在此期间暂停编辑，只能按原操作继续或取消。 */
export type WhiteboardPendingKind = "publication" | "upgrade" | "migration";
const PENDING_LABELS: Record<WhiteboardPendingKind, string> = {
  publication: "共享没有完成，白板暂停编辑，内容完好保存在本机",
  upgrade: "插件数据升级没有完成，白板暂停编辑，内容完好保存在本机",
  migration: "上次版本更新没有完成，白板暂停编辑，原内容完好保存在本机",
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
    case "connecting":
      return { label: "已保存在本机，正在连接协作服务…", tone: "syncing" };
    case "syncing":
      return { label: "已保存在本机，正在同步…", tone: "syncing", transientSyncing: true };
    case "synced":
      return remote.unsynced
        ? { label: "已保存在本机，正在同步…", tone: "syncing", transientSyncing: true }
        : { label: "已同步", tone: "live" };
    case "waiting":
      return { label: "已保存在本机，等待协作端确认之前的改动…", tone: "syncing" };
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
        label: "协作端已更新这块白板的版本，采用新版本后继续同步；本机未同步的改动会单独保留",
        tone: "syncing",
        actions: ["adopt"],
      };
    case "rejected":
      return {
        label: "协作端没有接受部分改动，改动已单独保留在本机，同步已暂停",
        tone: "error",
        actions: ["rebuild"],
      };
    default:
      return {
        label: `已保存在本机，同步未完成：${remote.message ?? "请稍后重试"}`,
        tone: "error",
        actions: ["retry"],
      };
  }
}

/**
 * 当前插件版本能直接转换的历史元素：旧版本契约、同一插件仍提供新版本且声明了从该版本的转换。
 * 缺失插件或没有转换的元素不列入，保持原样。
 */
export function upgradableElementIds(
  model: WhiteboardModel,
  catalog: WhiteboardContractCatalog
): string[] {
  const ids: string[] = [];
  const visit = (nodes: readonly WhiteboardElementSnapshot[]) =>
    nodes.forEach(node => {
      const entry = catalog.get(node.contractId),
        target = entry && catalog.current(entry.contract.type);
      if (
        entry &&
        target &&
        !entry.current &&
        target.contract.owner === entry.contract.owner &&
        target.element.migrations?.some(item => item.from === entry.contract.dataVersion)
      )
        ids.push(node.id);
      visit(node.children);
    });
  model.read().pages.forEach(page => visit(page.children));
  return ids;
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
