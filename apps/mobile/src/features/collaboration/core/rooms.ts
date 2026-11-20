import { NODE_DOCUMENT_VERSION, type CollaborationSession } from "@tau/collaboration";
import * as tauri from "../../../services/tauri";
import * as rest from "./rest";
import type { RuntimeSession } from "./types";
import type { CollaborationManager } from "./manager";
import { canRetryRead, describeError } from "./utils";

const JOIN_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;

/** 运行时会话（编辑页通过它取得 Y.Doc / Awareness） */
export function session(manager: CollaborationManager, documentId?: string) {
  if (!documentId) return undefined;
  return manager.sessions.get(documentId);
}

/** 打开文档；列表刷新尚未覆盖时（如刚被批准）就地补建会话。 */
export async function openDocument(
  manager: CollaborationManager,
  documentId: string
): Promise<CollaborationSession> {
  await manager.whenReady();
  const existing = manager.sessions.get(documentId);
  if (existing) {
    if (existing.info.connection === "offline" || existing.info.connection === "error")
      await manager.reconnect(documentId);
    return manager.sessions.get(documentId)?.info ?? existing.info;
  }
  let info = manager.rooms.get(documentId);
  if (!info) {
    try {
      info = (await manager.listRooms()).get(documentId);
    } catch (failure) {
      if (!canRetryRead(failure)) throw failure;
      const cached = await tauri.collabReadCache(documentId);
      if (cached?.metadata.serverUrl !== manager.serverUrl || cached.metadata.status !== "active")
        throw failure;
      return (await manager.openSession(cached.metadata)).info;
    }
  }
  if (!info) throw new Error("COLLAB_NOT_FOUND: 协作文档不存在或已失去访问权限");
  if (info.kind !== "content" || info.protocolVersion !== NODE_DOCUMENT_VERSION)
    throw new Error("COLLAB_CLIENT_UPGRADE_REQUIRED: 协作文档版本或类型不受支持");
  return (await manager.openSession(info)).info;
}

export function listRooms(manager: CollaborationManager) {
  manager.listing ??= rest
    .listDocuments(manager.serverUrl)
    .then(({ documents }) => {
      const rooms = new Map(documents.map(info => [info.id, info]));
      if (!manager.stopped) manager.rooms = rooms;
      return rooms;
    })
    .finally(() => {
      manager.listing = undefined;
    });
  return manager.listing;
}

export function refresh(manager: CollaborationManager): Promise<void> {
  if (manager.refreshing) return manager.refreshing;
  if (manager.stopped) return Promise.resolve();
  manager.refreshing = manager.refreshRooms().finally(() => {
    manager.refreshing = undefined;
  });
  return manager.refreshing;
}

export async function refreshRooms(manager: CollaborationManager) {
  try {
    const serverUrl = manager.serverUrl;
    const recovery = await tauri.collabListCache();
    const closing = recovery.filter(record => record.close);
    for (const session of manager.sessions.values()) {
      if (session.close && !closing.some(record => record.id === session.info.id))
        closing.push({
          ...session.info,
          close: session.close,
          baselineId: String(session.doc.getMap("meta").get("baselineId")),
          epoch: Number(session.doc.getMap("meta").get("epoch")),
        });
    }
    const failures: string[] = [];
    for (const record of closing) {
      try {
        await manager.leave(record.id);
      } catch (failure) {
        failures.push(describeError(failure, "共享收尾尚未完成"));
      }
    }
    const rooms = await manager.listRooms();
    if (manager.stopped) return;
    for (const info of rooms.values())
      if (info.kind === "content") manager.pendingJoins.delete(info.id);
    manager.changed();
    const active: Promise<RuntimeSession>[] = [];
    for (const session of [...manager.sessions.values()]) {
      const info = manager.rooms.get(session.info.id);
      if (info) active.push(manager.openSession(info));
      else if (session.info.status === "active") manager.revokeSession(session, "revoked");
    }
    const settled = await Promise.allSettled(active);
    for (const result of settled)
      if (result.status === "rejected")
        failures.push(describeError(result.reason, "协作会话暂未完成对账"));
    manager.requests = (await rest.listJoinRequests(serverUrl)).requests;
    manager.error = failures[0];
    void manager.connectEvents(serverUrl).catch(() => manager.scheduleEventsReconnect(serverUrl));
    manager.recoverCachedSessions(recovery);
  } catch (failure) {
    manager.error = describeError(failure, "协作服务器暂时无法连接");
  } finally {
    // refresh 等待期间被 stop：重新收敛到空闲态，避免迟到会话污染状态
    if (manager.stopped) manager.stop();
    else manager.changed();
  }
}

export function recoverCachedSessions(
  manager: CollaborationManager,
  cached: tauri.CachedContentSession[]
) {
  if (manager.stopped) return;
  for (const record of cached) {
    const room = manager.rooms.get(record.id);
    if (
      room?.kind === "content" &&
      room.protocolVersion === NODE_DOCUMENT_VERSION &&
      record.serverUrl === manager.serverUrl &&
      record.status === "active" &&
      !record.close &&
      (record.role === "owner" || record.pending) &&
      !manager.sessions.has(record.id)
    )
      void manager
        .openSession(room)
        .catch(failure => console.warn("协作缓存后台恢复暂未完成", failure));
  }
}

/** 用户交互触发的写操作统一模板：等待启动完成（避免把请求发往错误的服务器）、
 *  执行、随后刷新让 /events 与列表尽快反映变更。 */
export async function act<T>(
  manager: CollaborationManager,
  action: (serverUrl: string) => Promise<T>
): Promise<T> {
  await manager.whenReady();
  const result = await action(manager.serverUrl);
  await manager.refresh();
  return result;
}

export async function joinByCode(manager: CollaborationManager, code: string) {
  const result = await manager.act(serverUrl => rest.requestJoin(serverUrl, code));
  if (result.status === "pending" && !manager.rooms.has(result.documentId)) {
    manager.pendingJoins.set(result.documentId, Date.now() + JOIN_REQUEST_TTL_MS);
  } else {
    manager.pendingJoins.delete(result.documentId);
  }
  return result;
}

export async function decideJoinRequest(
  manager: CollaborationManager,
  requestId: string,
  approve: boolean
) {
  return manager.act(serverUrl => rest.decideJoinRequest(serverUrl, requestId, approve));
}

export async function rotateInvitation(manager: CollaborationManager, documentId: string) {
  return manager.act(serverUrl => rest.rotateInvitation(serverUrl, documentId));
}

export async function removeMember(
  manager: CollaborationManager,
  documentId: string,
  deviceId: string
) {
  return manager.act(serverUrl => rest.removeMember(serverUrl, documentId, deviceId));
}

export async function updateNickname(manager: CollaborationManager, nickname: string) {
  await manager.whenReady();
  const identity = await rest.updateNickname(manager.serverUrl, nickname);
  manager.nickname = identity.nickname;
  manager.changed();
  return identity;
}
