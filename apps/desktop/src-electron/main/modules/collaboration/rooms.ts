import * as Y from "yjs";
import { WebSocket } from "ws";
import {
  NODE_DOCUMENT_VERSION,
  WHITEBOARD_DOCUMENT_VERSION,
  readDocumentIdentity,
  validateNodeDocument,
  type ContentSessionSnapshot,
  type ContentSessionTarget,
  type CollaborationEvent,
  type CollaborationSession,
  type CollaborationState,
  type JoinRequest,
  type SharedDocumentInfo,
  type SharedDocumentListing,
  type SourceBinding,
} from "@tau/collaboration";
import type { ContentDatabase } from "../content-runtime";
import type { ContentOpenContext } from "../content-runtime/sharing";
import databaseModule from "../database";
import ContentTable from "../tables/content";
import { restoreContentBinding } from "./content-repository";
import { registerContentSession, unregisterContentSession } from "./content-sessions";
import type { RuntimeSession } from "./types";
import { localSessionId } from "./session-identity";
import { findCollaborationBinding } from "../collaboration-guard";
import type { CollaborationManager } from "./index";

export async function openSharedContent(
  manager: CollaborationManager,
  event: ContentOpenContext,
  target: ContentSessionTarget,
  check: () => void
): Promise<ContentSessionSnapshot> {
  const { db, name } = manager.content.databaseForEvent(event);
  const binding = findCollaborationBinding(db, target.contentId);
  if (!binding) return manager.localRuntime.resumeLocalOpen(event, target, check);
  const id = binding.document_id;
  let session = manager.content.find(id);
  if (!session) {
    const known = manager.remoteDocuments.get(binding.server_url)?.get(id);
    const room = known ?? (await manager.listRooms(binding.server_url)).get(id);
    check();
    if (!room) {
      db.prepare(
        "DELETE FROM collaboration_bindings WHERE content_id=? AND document_id=? AND server_url=?"
      ).run(target.contentId, id, binding.server_url);
      return manager.localRuntime.resumeLocalOpen(event, target, check);
    }
    manager.assertContentRoom(room);
    session = await manager.openRemoteDocument(binding.server_url, room);
    check();
  }
  if (session.info.serverUrl !== binding.server_url) throw new Error("共享会话属于另一服务器");
  const source = restoreContentBinding(db, name, id, binding.server_url);
  if (!source || source.contentId !== target.contentId) throw new Error("原内容关联已变化");
  const previous = session.info.source;
  if (previous) {
    if (
      previous.databaseName.replace(/\.db$/, "") !== name.replace(/\.db$/, "") ||
      previous.contentId !== source.contentId ||
      previous.contentCreatedAt !== source.contentCreatedAt ||
      (previous.librarySourceId && previous.librarySourceId !== source.librarySourceId) ||
      (previous.contentDocumentId && previous.contentDocumentId !== source.contentDocumentId)
    )
      throw new Error("共享正文属于另一份资料库，原共享会话仍保留");
    source.projectionRevision = previous.projectionRevision ?? source.projectionRevision;
  }
  session.info.source = source;
  manager.store.metadata(session.info);
  unregisterContentSession(session);
  registerContentSession(db, target.contentId, session);
  ContentTable.ensureTaskIds(db, target.contentId);
  void manager.recoverReplacement(session);
  await manager.finishOpenedPublish(db, source, session);
  check();
  return {
    documentId: id,
    mode: session.info.mode || "shared",
    title: session.doc.getText("title").toString(),
    frozen: Boolean(session.info.frozen),
    source: session.info.source,
  };
}

export async function finishOpenedPublish(
  manager: CollaborationManager,
  db: ContentDatabase["db"],
  source: SourceBinding,
  session: RuntimeSession
) {
  if (session.info.role !== "owner") return;
  const id = localSessionId(db.name, source.contentId, source.contentCreatedAt);
  const local = manager.localRuntime;
  if (!local.pendingShare(id)) return;
  await local.finishPublishedShare(id, source, {
    ...readDocumentIdentity(session.doc),
    serverUrl: session.info.serverUrl,
  });
}

export function state(manager: CollaborationManager): CollaborationState {
  const sessions = new Map(
    [...manager.content.activeSessions()]
      .filter(session => session.info.mode !== "local")
      .map(({ info }) => [`${info.serverUrl}/${info.id}`, info])
  );
  const whiteboards = [];
  for (const [serverUrl, rooms] of manager.remoteDocuments) {
    for (const room of rooms.values()) {
      if (room.kind === "whiteboard" && room.protocolVersion === WHITEBOARD_DOCUMENT_VERSION)
        whiteboards.push({ ...room, serverUrl });
      if (
        room.kind !== "content" ||
        room.protocolVersion !== NODE_DOCUMENT_VERSION ||
        sessions.has(`${serverUrl}/${room.id}`)
      )
        continue;
      sessions.set(`${serverUrl}/${room.id}`, {
        ...room,
        serverUrl,
        mode: "shared",
        connection: "idle",
        pending: false,
        leaving: false,
        source: manager.content.findLocalSource(room.id, serverUrl),
      });
    }
  }
  return {
    serverUrl: manager.serverUrl,
    nickname: manager.nickname,
    deviceId: manager.client.identities.get(manager.serverUrl)?.id,
    sessions: [...sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt),
    whiteboards,
    requests: manager.requests,
    error: manager.error,
  };
}

export function roomAddress(manager: CollaborationManager, id: string): string | undefined {
  const session = manager.content.activeSession(id);
  if (session && session.info.mode !== "local") return session.info.serverUrl;
  return [...manager.remoteDocuments].find(([, rooms]) => rooms.has(id))?.[0];
}

export function assertContentRoom(_manager: CollaborationManager, room: SharedDocumentListing) {
  if (room.kind !== "content" || room.protocolVersion !== NODE_DOCUMENT_VERSION)
    throw new Error("协作文档版本或类型不受支持");
}

export async function openRoom(manager: CollaborationManager, id: string): Promise<RuntimeSession> {
  let session = manager.content.find(id);
  if (session?.info.mode === "local") throw new Error("本机正文不属于共享房间");
  if (!session) {
    const url = manager.roomAddress(id) ?? manager.serverUrl;
    const room =
      manager.remoteDocuments.get(url)?.get(id) ?? (await manager.listRooms(url)).get(id);
    if (!room) throw new Error("协作文档不存在或已失去访问权限");
    manager.assertContentRoom(room);
    session = await manager.openRemoteDocument(url, room);
  }
  const previous = session.info.source;
  const db = previous && databaseModule.getDatabase(previous.databaseName);
  if (db?.open && previous && session.info.role === "owner") {
    const source = restoreContentBinding(db, previous.databaseName, id, session.info.serverUrl);
    if (
      source?.contentId === previous.contentId &&
      source.contentCreatedAt === previous.contentCreatedAt &&
      (!previous.librarySourceId || source.librarySourceId === previous.librarySourceId) &&
      (!previous.contentDocumentId || source.contentDocumentId === previous.contentDocumentId)
    )
      await manager.finishOpenedPublish(db, source, session);
  }
  return session;
}

export async function connectEvents(manager: CollaborationManager, url: string) {
  if (manager.events.has(url) || manager.stopped) return;
  const { ticket } = await manager.client.request<{ ticket: string }>(url, "/v1/tickets", "POST", {
    documentId: null,
  });
  if (manager.events.has(url) || manager.stopped) return;
  const socket = new WebSocket(`${url.replace(/^http/, "ws")}/events`, {
    maxPayload: 1024 * 1024,
  });
  manager.events.set(url, socket);
  socket.on("open", () => socket.send(JSON.stringify({ ticket })));
  socket.on("message", data => {
    try {
      const event = JSON.parse(data.toString()) as CollaborationEvent;
      if (event.type === "refresh") void manager.refresh();
      else if (event.type === "presence") {
        const session = manager.content.activeSession(event.documentId);
        const room = manager.remoteDocuments.get(url)?.get(event.documentId);
        if (room) room.members = event.members;
        if (session?.info.serverUrl === url) {
          session.info.members = event.members;
          manager.content.changed(session);
        } else if (room) manager.content.changed();
      } else {
        const session = manager.content.activeSession(event.documentId);
        const removed = manager.remoteDocuments.get(url)?.delete(event.documentId);
        const cached = session ?? (removed ? manager.content.find(event.documentId) : undefined);
        if (cached?.info.serverUrl === url) void manager.revoke(cached, event.type);
        else if (removed) manager.content.changed();
      }
    } catch {
      /* 忽略无效状态消息，下次刷新会重新获取权威状态。 */
    }
  });
  socket.on("error", () => {});
  socket.on("close", () => {
    manager.events.delete(url);
    if (!manager.stopped)
      setTimeout(() => void manager.connectEvents(url).catch(() => {}), 5000).unref();
  });
}

export function listRooms(manager: CollaborationManager, url: string) {
  let listing = manager.listing.get(url);
  if (!listing) {
    listing = manager.client
      .request<{ documents: SharedDocumentListing[] }>(url, "/v1/documents")
      .then(({ documents }) => {
        const rooms = new Map(documents.map(info => [info.id, info]));
        if (!manager.stopped) manager.remoteDocuments.set(url, rooms);
        return rooms;
      })
      .finally(() => manager.listing.delete(url));
    manager.listing.set(url, listing);
  }
  return listing;
}

export function refresh(manager: CollaborationManager): Promise<void> {
  if (manager.refreshing) return manager.refreshing;
  if (manager.stopped || manager.pendingCreates.size > 0) return Promise.resolve();
  manager.refreshing = manager.refreshRooms().finally(() => {
    manager.refreshing = undefined;
  });
  return manager.refreshing;
}

export async function refreshRooms(manager: CollaborationManager) {
  const urls = new Set([
    manager.serverUrl,
    ...manager.remoteDocuments.keys(),
    ...[...manager.content.activeSessions()]
      .filter(session => session.info.mode !== "local")
      .map(session => session.info.serverUrl),
  ]);
  const errors: string[] = [];
  for (const url of urls) {
    if (!manager.store.get(`identity:${url}`, null)) continue;
    try {
      const previous = manager.remoteDocuments.get(url);
      const rooms = await manager.listRooms(url);
      if (manager.stopped) return;
      for (const [id, room] of previous ?? [])
        if (room.kind === "content" && !rooms.has(id)) manager.content.find(id);
      const failed: string[] = [];
      for (const session of [...manager.content.activeSessions()]) {
        if (session.info.serverUrl !== url) continue;
        const info = rooms.get(session.info.id);
        try {
          if (session.info.leaving) await manager.finishLeave(session);
          else if (info) await manager.syncRemoteDocument(url, info);
          else if (session.info.status === "active") await manager.revoke(session, "revoked");
        } catch (error) {
          console.warn(`[collaboration] 共享文档 ${session.info.id} 暂时无法对账`, error);
          failed.push(`《${session.info.title || "未命名"}》`);
        }
      }
      if (failed.length) errors.push(`${failed.join("、")}暂时无法对账，稍后自动重试`);
      if (url === manager.serverUrl)
        manager.requests = (
          await manager.client.request<{ requests: JoinRequest[] }>(url, "/v1/join-requests")
        ).requests;
      void manager.connectEvents(url).catch(() => {});
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "协作服务器暂时无法连接");
    }
  }
  manager.error = errors[0];
  manager.content.changed();
}

/** 已有会话继续核对基线，目录中的其他正文只在打开时加载。 */
export async function syncRemoteDocument(
  manager: CollaborationManager,
  url: string,
  info: SharedDocumentInfo
): Promise<void> {
  const existing = manager.content.find(info.id);
  if (existing) {
    if (existing.info.serverUrl !== url) return;
    Object.assign(existing.info, info);
    const protocol = await manager.client.request<{
      version: number;
      epoch: number;
      baselineId: string;
    }>(url, `/v1/documents/${info.id}/protocol`);
    if (manager.content.activeSession(info.id) !== existing || existing.info.status !== "active")
      return;
    if (
      protocol.version === NODE_DOCUMENT_VERSION &&
      protocol.epoch > Number(existing.doc.getMap("meta").get("epoch") ?? 0)
    ) {
      // 远端已换代：旧缓存不能合入新基线，备份后按服务器确认快照重建，编辑视图随 replaced 事件重开
      manager.content.discardRemoteSession(existing, "协作端基线已变化");
      await manager.openRemoteDocument(url, info);
      return;
    }
    manager.store.metadata(existing.info);
    await manager.recoverReplacement(existing);
    return;
  }
  await manager.openRemoteDocument(url, info);
}

export function openRemoteDocument(
  manager: CollaborationManager,
  url: string,
  info: SharedDocumentInfo
): Promise<RuntimeSession> {
  const key = `${url}/${info.id}`;
  let opening = manager.openingRooms.get(key);
  if (!opening) {
    opening = manager.loadRemoteDocument(url, info).finally(() => manager.openingRooms.delete(key));
    manager.openingRooms.set(key, opening);
  }
  return opening;
}

export async function loadRemoteDocument(
  manager: CollaborationManager,
  url: string,
  info: SharedDocumentInfo
): Promise<RuntimeSession> {
  const { state } = await manager.client.request<{ state: string }>(
    url,
    `/v1/documents/${info.id}/state`,
    "GET",
    undefined,
    NODE_DOCUMENT_VERSION
  );
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, Buffer.from(state, "base64"));
    await validateNodeDocument(doc, {
      documentId: info.id,
      baselineId: String(doc.getMap("meta").get("baselineId")),
      epoch: Number(doc.getMap("meta").get("epoch")),
    });
    const rooms = manager.remoteDocuments.get(url);
    if (rooms && !rooms.has(info.id)) throw new Error("协作会话已失效，请重新打开");
    const existing = manager.content.activeSession(info.id);
    if (existing) {
      if (existing.info.serverUrl !== url) throw new Error("共享会话属于另一服务器");
      doc.destroy();
      return existing;
    }
  } catch (failure) {
    doc.destroy();
    throw failure;
  }
  const session: CollaborationSession = {
    ...(manager.remoteDocuments.get(url)?.get(info.id) ?? info),
    serverUrl: url,
    mode: "shared",
    source: manager.content.findLocalSource(info.id, url),
    connection: "connecting",
    pending: false,
    leaving: false,
  };
  const runtime = manager.content.install(session, doc);
  manager.content.changed(runtime);
  void manager.recoverReplacement(runtime);
  return runtime;
}
