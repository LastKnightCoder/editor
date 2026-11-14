import localContent, { ContentSessionManager, type ContentDatabase } from "../content-runtime";
import { readDocumentIdentity } from "@tau/collaboration";
import type { IpcMainInvokeEvent } from "electron";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { WebSocket } from "ws";
import * as Y from "yjs";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  DEFAULT_COLLABORATION_URL,
  replaceText,
  NODE_DOCUMENT_VERSION,
  WHITEBOARD_DOCUMENT_VERSION,
  readNodeDocument,
  buildScopedContentUpdate,
  ScopedContentConflictError,
  ScopedUndoLimitError,
  type DocumentOperation,
  type ScopedContentSubmission,
  type ScopedContentResult,
  createNodeDocument,
  validateNodeDocument,
  collectNodeDocumentResources,
  ASSET_PREFIX,
  type ContentSessionTarget,
  type ContentSessionSnapshot,
  type CollaborationEvent,
  type CollaborationSession,
  type CollaborationState,
  type JoinRequest,
  type SharedDocumentInfo,
  type SharedDocumentListing,
  type SourceType,
} from "@tau/collaboration";
import PathUtil from "../../utils/PathUtil";
import databaseModule from "../database";
import ContentTable from "../tables/content";
import { ContentDocumentTable } from "../tables/content-document";
import { ContentIdentityTable } from "../tables/content-identity";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import { bindingMatches, planClosedReshare, restoreContentBinding } from "./content-repository";
import { CollaborationAssetService } from "./asset-service";
import { CollaborationClient } from "./client";
import { registerCollaborationIpc } from "./ipc-controller";
import type { RuntimeSession } from "./types";
import { getContentLength } from "@/utils/helper";
import { CollaborationLocalStore } from "./local-store";
import { ContentLocalState } from "./content-local-state";
import type { ScopedWriteOptions } from "../content-runtime/agent/suggestion-service";
import { getDevelopmentServerUrl } from "./dev-server";
import { findCollaborationBinding } from "../collaboration-guard";
import { localSessionId } from "./session-identity";
import { collaborationImageStorage } from "../../services/collaboration-image-storage";
import {
  registerContentSession,
  unregisterContentSession,
  contentRevision,
} from "./content-sessions";

export class CollaborationManager extends ContentSessionManager {
  name = "collaboration";
  private localRuntime?: ContentSessionManager;
  private client!: CollaborationClient;
  private transports = new Map<string, HocuspocusProviderWebsocket>();
  private events = new Map<string, WebSocket>();
  private requests: JoinRequest[] = [];
  private refreshing?: Promise<void>;
  private readonly remoteDocuments = new Map<string, Map<string, SharedDocumentListing>>();
  private readonly listing = new Map<string, Promise<Map<string, SharedDocumentListing>>>();
  private readonly openingRooms = new Map<string, Promise<RuntimeSession>>();
  private syncingResources = false;
  private error?: string;
  private stopped = false;
  private pendingCreates = new Map<string, Promise<{ documentId: string; code: string }>>();
  private finishingLeaves = new Set<string>();
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  protected override broadcastSharedState() {
    this.broadcast("collaboration:state", this.state());
  }
  protected override flushSessionResources() {
    void this.flushResources();
  }
  protected override agentOwner(): ContentSessionManager {
    return this.localRuntime ?? this;
  }

  protected override async openSharedContent(
    event: IpcMainInvokeEvent | ContentDatabase,
    target: ContentSessionTarget
  ): Promise<ContentSessionSnapshot> {
    const { db, name } = this.databaseForEvent(event);
    const binding = findCollaborationBinding(db, target.contentId);
    if (!binding) return this.openAfterUnbind(event, target);
    const id = binding.document_id;
    let session = this.findSession(id);
    if (!session) {
      const known = this.remoteDocuments.get(binding.server_url)?.get(id);
      const room = known ?? (await this.listRooms(binding.server_url)).get(id);
      if (this.databaseForEvent(event).db !== db) throw new Error("资料库已切换，请重新打开内容");
      if (!room) {
        db.prepare(
          "DELETE FROM collaboration_bindings WHERE content_id=? AND document_id=? AND server_url=?"
        ).run(target.contentId, id, binding.server_url);
        return this.openAfterUnbind(event, target);
      }
      this.assertContentRoom(room);
      session = await this.openRemoteDocument(binding.server_url, room);
      if (this.databaseForEvent(event).db !== db) throw new Error("资料库已切换，请重新打开内容");
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
    this.store.metadata(session.info);
    unregisterContentSession(session);
    registerContentSession(db, target.contentId, session);
    ContentTable.ensureTaskIds(db, target.contentId);
    return {
      documentId: id,
      mode: session.info.mode || "shared",
      title: session.doc.getText("title").toString(),
      frozen: Boolean(session.info.frozen),
      source: session.info.source,
    };
  }

  private openAfterUnbind(
    event: IpcMainInvokeEvent | ContentDatabase,
    target: ContentSessionTarget
  ) {
    // 本机 open 可能正在等待这次共享查询，直接续走当前打开请求。
    return (this.localRuntime ?? this).resumeLocalOpen(event, target);
  }

  protected override async confirmSharedReplacement(
    session: RuntimeSession,
    identity: { documentId: string; baselineId: string; epoch: number },
    expectedRevision: string,
    update: Uint8Array,
    operationId: string,
    check: () => void
  ) {
    if (session.info.mode !== "local") {
      const protocol = await this.client.request<{ revision: string; sequence: number }>(
        session.info.serverUrl,
        `/v1/documents/${session.info.id}/protocol`
      );
      check();
      if (protocol.revision !== expectedRevision)
        throw new Error("CONTENT_VERSION_CONFLICT: 共享正文已变化，待应用结果已保留");
      const route = `/v1/documents/${session.info.id}/operations/${operationId}`;
      let result: { operation: import("@tau/collaboration").DocumentOperation | null };
      try {
        result = await this.client.request(session.info.serverUrl, route, "POST", {
          operationId,
          version: NODE_DOCUMENT_VERSION,
          baselineId: identity.baselineId,
          epoch: identity.epoch,
          expectedRevision,
          expectedSequence: protocol.sequence,
          updateHash: createHash("sha256").update(update).digest("hex"),
          expiresAt: this.client.serverTime(session.info.serverUrl) + 4 * 60_000,
          update: Buffer.from(update).toString("base64"),
        });
      } catch (failure) {
        result = await this.client.request(session.info.serverUrl, route);
        if (!result.operation) throw failure;
      }
      if (result.operation?.state !== "COMMITTED")
        throw new Error("CONTENT_VERSION_CONFLICT: 共享修改未提交，待应用结果已保留");
      if (
        result.operation.baselineId !== identity.baselineId ||
        result.operation.epoch !== identity.epoch ||
        session.doc.getMap("meta").get("baselineId") !== identity.baselineId
      )
        throw new Error("正文代次已变化，已保留原操作结果");
    } else check();
  }

  private get serverUrl() {
    return getDevelopmentServerUrl() || DEFAULT_COLLABORATION_URL;
  }
  private get nickname() {
    return this.store.get("nickname", "Tau 用户");
  }
  private state(): CollaborationState {
    const sessions = new Map(
      [...this.sessions.values()]
        .filter(session => session.info.mode !== "local")
        .map(({ info }) => [`${info.serverUrl}/${info.id}`, info])
    );
    const whiteboards = [];
    for (const [serverUrl, rooms] of this.remoteDocuments) {
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
          source: this.findLocalSource(room.id, serverUrl),
        });
      }
    }
    return {
      serverUrl: this.serverUrl,
      nickname: this.nickname,
      deviceId: this.client.identities.get(this.serverUrl)?.id,
      sessions: [...sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt),
      whiteboards,
      requests: this.requests,
      error: this.error,
    };
  }
  private roomAddress(id: string): string | undefined {
    const session = this.sessions.get(id);
    if (session && session.info.mode !== "local") return session.info.serverUrl;
    return [...this.remoteDocuments].find(([, rooms]) => rooms.has(id))?.[0];
  }

  private assertContentRoom(room: SharedDocumentListing) {
    if (room.kind !== "content" || room.protocolVersion !== NODE_DOCUMENT_VERSION)
      throw new Error("协作文档版本或类型不受支持");
  }

  private async openRoom(id: string): Promise<RuntimeSession> {
    const existing = this.findSession(id);
    if (existing?.info.mode === "local") throw new Error("本机正文不属于共享房间");
    if (existing) return existing;
    const url = this.roomAddress(id) ?? this.serverUrl;
    const room = this.remoteDocuments.get(url)?.get(id) ?? (await this.listRooms(url)).get(id);
    if (!room) throw new Error("协作文档不存在或已失去访问权限");
    this.assertContentRoom(room);
    return this.openRemoteDocument(url, room);
  }

  /** 白板发布或加入后立即刷新房间列表，避免等待定时刷新。 */
  refreshShared(): Promise<void> {
    return this.refresh();
  }
  private transport(url: string) {
    let transport = this.transports.get(url);
    if (!transport) {
      transport = new HocuspocusProviderWebsocket({
        url: `${url.replace(/^http/, "ws")}/ws`,
        WebSocketPolyfill: WebSocket,
        initialDelay: 1000,
        maxDelay: 30000,
      });
      this.transports.set(url, transport);
    }
    return transport;
  }
  protected override attach(session: RuntimeSession) {
    if (
      session.info.mode === "local" ||
      session.doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION ||
      session.info.frozen ||
      session.provider ||
      session.info.leaving ||
      session.info.status !== "active"
    )
      return;
    const { id, serverUrl } = session.info;
    const transport = this.transport(serverUrl);
    session.provider = new HocuspocusProvider({
      name: id,
      document: session.doc,
      awareness: session.awareness,
      websocketProvider: transport,
      token: async () =>
        (
          await this.client.request<{ ticket: string }>(serverUrl, "/v1/tickets", "POST", {
            documentId: id,
            ...(session.doc.getMap("meta").get("version") === NODE_DOCUMENT_VERSION
              ? {
                  protocolVersion: NODE_DOCUMENT_VERSION,
                  epoch: session.doc.getMap("meta").get("epoch"),
                  baselineId: session.doc.getMap("meta").get("baselineId"),
                }
              : {}),
          })
        ).ticket,
      onStatus: ({ status }) => {
        session.info.connection =
          status === "connected" ? "connected" : status === "connecting" ? "connecting" : "offline";
        this.changed(session);
      },
      onSynced: ({ state }) => {
        if (!state) return;
        session.info.connection = "connected";
        session.info.error = undefined;
        if (!session.provider?.hasUnsyncedChanges && !this.assets.hasPending(id))
          session.info.pending = false;
        this.changed(session);
      },
      onUnsyncedChanges: ({ number }) => {
        if (session.info.status === "active" && !session.info.leaving)
          session.info.pending = number > 0 || this.assets.hasPending(id);
        this.changed(session);
      },
      onAuthenticationFailed: () => {
        session.info.connection = "error";
        session.info.error = "协作身份验证失败或访问权限已变更";
        this.changed(session);
        void this.refresh();
      },
    });
    session.provider.awareness?.setLocalStateField("activity", "background");
    if (!this.assets.hasPending(id)) session.provider.attach();
    void transport.connect().catch(() => {
      session.info.connection = "offline";
      this.changed(session);
    });
  }
  private async prepareLeave(session: RuntimeSession) {
    if (session.info.frozen) throw new Error("内容正在切换，请稍后重试");
    try {
      await this.freeze(session);
      if (
        session.info.pending ||
        this.assets.hasPending(session.info.id) ||
        session.provider?.hasUnsyncedChanges ||
        session.provider?.synced === false
      )
        throw new Error("仍有未同步改动，请等待同步后再退出");
      session.provider?.detach();
      if (session.info.role === "owner" && session.info.mode !== "local") {
        const { state } = await this.client.request<{ state: string }>(
          session.info.serverUrl,
          `/v1/documents/${session.info.id}/state`,
          "GET",
          undefined,
          NODE_DOCUMENT_VERSION
        );
        const bytes = Buffer.from(state, "base64");
        const protocol = await this.client.request<{
          revision: string;
          epoch: number;
          baselineId: string;
        }>(session.info.serverUrl, `/v1/documents/${session.info.id}/protocol`);
        if (createHash("sha256").update(bytes).digest("hex") !== protocol.revision)
          throw new Error("共享正文仍在变化，请稍后重新结束共享");
        const meta = session.doc.getMap("meta");
        if (
          Number(meta.get("epoch") ?? 0) !== protocol.epoch ||
          readDocumentIdentity(session.doc).baselineId !== protocol.baselineId
        )
          throw new Error("房间基线已变化，已暂停当前会话同步");
        Y.applyUpdate(session.doc, bytes, session.provider);
        const resources = await this.client.request<{ ids: string[] }>(
          session.info.serverUrl,
          `/v1/documents/${session.info.id}/assets`
        );
        await this.preserveOwnerImages(
          session,
          resources.ids.map(id => ASSET_PREFIX + id)
        );
        for (const id of resources.ids)
          await this.assets.localizeReference(
            session.info.serverUrl,
            session.info.id,
            ASSET_PREFIX + id
          );
        await this.persistBeforeClose(session);
        this.store.set(`close-revision:${session.info.id}`, protocol.revision);
      } else {
        const references = collectNodeDocumentResources(session.doc);
        for (const reference of references)
          if (reference.startsWith(ASSET_PREFIX))
            await this.assets.localizeReference(session.info.serverUrl, session.info.id, reference);
      }
    } catch (error) {
      this.unfreeze(session);
      if (!this.assets.hasPending(session.info.id)) session.provider?.attach();
      throw error;
    }
  }

  private async connectEvents(url: string) {
    if (this.events.has(url) || this.stopped) return;
    const { ticket } = await this.client.request<{ ticket: string }>(url, "/v1/tickets", "POST", {
      documentId: null,
    });
    if (this.events.has(url) || this.stopped) return;
    const socket = new WebSocket(`${url.replace(/^http/, "ws")}/events`, {
      maxPayload: 1024 * 1024,
    });
    this.events.set(url, socket);
    socket.on("open", () => socket.send(JSON.stringify({ ticket })));
    socket.on("message", data => {
      try {
        const event = JSON.parse(data.toString()) as CollaborationEvent;
        if (event.type === "refresh") void this.refresh();
        else if (event.type === "presence") {
          const session = this.sessions.get(event.documentId);
          const room = this.remoteDocuments.get(url)?.get(event.documentId);
          if (room) room.members = event.members;
          if (session?.info.serverUrl === url) {
            session.info.members = event.members;
            this.changed(session);
          } else if (room) this.changed();
        } else {
          const session = this.sessions.get(event.documentId);
          const removed = this.remoteDocuments.get(url)?.delete(event.documentId);
          const cached = session ?? (removed ? this.findSession(event.documentId) : undefined);
          if (cached?.info.serverUrl === url) void this.revoke(cached, event.type);
          else if (removed) this.changed();
        }
      } catch {
        /* 忽略无效状态消息，下次刷新会重新获取权威状态。 */
      }
    });
    socket.on("error", () => {});
    socket.on("close", () => {
      this.events.delete(url);
      if (!this.stopped)
        setTimeout(() => void this.connectEvents(url).catch(() => {}), 5000).unref();
    });
  }
  private listRooms(url: string) {
    let listing = this.listing.get(url);
    if (!listing) {
      listing = this.client
        .request<{ documents: SharedDocumentListing[] }>(url, "/v1/documents")
        .then(({ documents }) => {
          const rooms = new Map(documents.map(info => [info.id, info]));
          if (!this.stopped) this.remoteDocuments.set(url, rooms);
          return rooms;
        })
        .finally(() => this.listing.delete(url));
      this.listing.set(url, listing);
    }
    return listing;
  }

  private refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    if (this.stopped || this.pendingCreates.size > 0) return Promise.resolve();
    this.refreshing = this.refreshRooms().finally(() => {
      this.refreshing = undefined;
    });
    return this.refreshing;
  }

  private async refreshRooms() {
    const urls = new Set([
      this.serverUrl,
      ...this.remoteDocuments.keys(),
      ...[...this.sessions.values()]
        .filter(session => session.info.mode !== "local")
        .map(session => session.info.serverUrl),
    ]);
    const errors: string[] = [];
    for (const url of urls) {
      if (!this.store.get(`identity:${url}`, null)) continue;
      try {
        const previous = this.remoteDocuments.get(url);
        const rooms = await this.listRooms(url);
        if (this.stopped) return;
        for (const [id, room] of previous ?? [])
          if (room.kind === "content" && !rooms.has(id)) this.findSession(id);
        const failed: string[] = [];
        for (const session of [...this.sessions.values()]) {
          if (session.info.serverUrl !== url) continue;
          const info = rooms.get(session.info.id);
          try {
            if (session.info.leaving) await this.finishLeave(session);
            else if (info) await this.syncRemoteDocument(url, info);
            else if (session.info.status === "active") await this.revoke(session, "revoked");
          } catch (error) {
            console.warn(`[collaboration] 共享文档 ${session.info.id} 暂时无法对账`, error);
            failed.push(`《${session.info.title || "未命名"}》`);
          }
        }
        if (failed.length) errors.push(`${failed.join("、")}暂时无法对账，稍后自动重试`);
        if (url === this.serverUrl)
          this.requests = (
            await this.client.request<{ requests: JoinRequest[] }>(url, "/v1/join-requests")
          ).requests;
        void this.connectEvents(url).catch(() => {});
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "协作服务器暂时无法连接");
      }
    }
    this.error = errors[0];
    this.changed();
  }

  /** 已有会话继续核对基线，目录中的其他正文只在打开时加载。 */
  private async syncRemoteDocument(url: string, info: SharedDocumentInfo): Promise<void> {
    const existing = this.findSession(info.id);
    if (existing) {
      if (existing.info.serverUrl !== url) return;
      Object.assign(existing.info, info);
      const protocol = await this.client.request<{
        version: number;
        epoch: number;
        baselineId: string;
      }>(url, `/v1/documents/${info.id}/protocol`);
      if (this.sessions.get(info.id) !== existing || existing.info.status !== "active") return;
      if (
        protocol.version === NODE_DOCUMENT_VERSION &&
        protocol.epoch > Number(existing.doc.getMap("meta").get("epoch") ?? 0)
      ) {
        // 远端已换代：旧缓存不能合入新基线，备份后按服务器确认快照重建，编辑视图随 replaced 事件重开
        await this.releaseRemoteSession(existing, "协作端基线已变化");
        await this.openRemoteDocument(url, info);
        return;
      }
      this.store.metadata(existing.info);
      return;
    }
    await this.openRemoteDocument(url, info);
  }

  private openRemoteDocument(url: string, info: SharedDocumentInfo): Promise<RuntimeSession> {
    const key = `${url}/${info.id}`;
    let opening = this.openingRooms.get(key);
    if (!opening) {
      opening = this.loadRemoteDocument(url, info).finally(() => this.openingRooms.delete(key));
      this.openingRooms.set(key, opening);
    }
    return opening;
  }

  private async loadRemoteDocument(url: string, info: SharedDocumentInfo): Promise<RuntimeSession> {
    const { state } = await this.client.request<{ state: string }>(
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
      const rooms = this.remoteDocuments.get(url);
      if (rooms && !rooms.has(info.id)) throw new Error("协作会话已失效，请重新打开");
      const existing = this.sessions.get(info.id);
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
      ...(this.remoteDocuments.get(url)?.get(info.id) ?? info),
      serverUrl: url,
      mode: "shared",
      source: this.findLocalSource(info.id, url),
      connection: "connecting",
      pending: false,
      leaving: false,
    };
    this.store.create(session, doc);
    const runtime = this.restore(session, doc);
    this.changed(runtime);
    return runtime;
  }
  private async createContent(
    event: IpcMainInvokeEvent,
    contentId: number,
    sourceType?: SourceType,
    sourceId?: number,
    sourceTitle?: string
  ) {
    if (!Number.isSafeInteger(contentId) || contentId <= 0) throw new Error("内容 ID 不合法");
    const { name } = this.databaseForEvent(event);
    const key = `${name}:${contentId}`;
    let operation = this.pendingCreates.get(key);
    if (!operation) {
      operation = (async () => {
        const body = this.localRuntime ?? this;
        let snapshot = await body.open(event, {
          contentId,
          sourceType,
          sourceId,
          sourceTitle,
        });
        let local =
          snapshot.mode === "local"
            ? body.getSession(snapshot.documentId)
            : this.requireSession(snapshot.documentId);
        // 命中结束共享的残留会话：先写回本地并拆除（同「清理本地记录」），再重走创建，
        // 否则会按「恢复共享」对已删的服务器文档重新签码
        const reshare = snapshot.mode !== "local" ? planClosedReshare(local.info) : null;
        if (reshare) {
          if (reshare.action === "reject") throw new Error(reshare.reason);
          await this.discardLocal(local);
          snapshot = await body.open(event, {
            contentId,
            sourceType,
            sourceId,
            sourceTitle,
          });
          local =
            snapshot.mode === "local"
              ? body.getSession(snapshot.documentId)
              : this.requireSession(snapshot.documentId);
        }
        if (snapshot.mode !== "local") {
          const invitation = await this.issueInvitation(local.info.serverUrl, local.info.id);
          return { documentId: local.info.id, code: invitation.code };
        }
        try {
          if (!local.info.frozen) await body.prepareShare(local);
          else if (!body.pendingShare(local.info.id))
            throw new Error("正文已暂停编辑，请等待当前保存或共享操作完成");
          if (sourceType !== "card" && sourceTitle !== undefined)
            replaceText(local.doc.getText("title"), sourceTitle.slice(0, 500));
          await body.save(local);
          const result = await this.publishSession(event, local, {
            contentId,
            sourceType,
            sourceId,
            sourceTitle: local.doc.getText("title").toString(),
          });
          return result;
        } catch (failure) {
          // 共享尚未提交时解除输入冻结
          if (body.find(local.info.id) === local && !body.pendingShare(local.info.id))
            body.cancelShare(local);
          throw failure;
        }
      })().finally(() => {
        this.pendingCreates.delete(key);
        void this.refresh();
      });
      this.pendingCreates.set(key, operation);
    }
    return operation;
  }

  /** 首次共享固定当前正文候选，提交失败沿原房间身份重试。 */
  private async publishSession(
    event: IpcMainInvokeEvent,
    session: RuntimeSession,
    target: { contentId: number; sourceType?: SourceType; sourceId?: number; sourceTitle?: string }
  ) {
    if (session.doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION)
      throw new Error("正文格式不受支持，无法发起共享");
    const { db, name } = this.databaseForEvent(event);
    const stored = ContentDocumentTable.read(db, target.contentId);
    const source = session.info.source;
    if (!stored || !source || source.databaseName !== name || source.contentId !== target.contentId)
      throw new Error("原正文关联已变化");
    const url = this.serverUrl;
    const identity = await this.client.identity(url);
    const previousId = session.info.id;
    const body = this.localRuntime ?? this;
    let prepared = body.pendingShare<{
      documentId: string;
      baselineId: string;
      state: string;
      revision: string;
      serverUrl: string;
    }>(previousId);
    if (!prepared) {
      const idempotencyKey = createHash("sha256")
        .update(
          JSON.stringify({
            documentId: stored.documentId,
            library: ContentIdentityTable.library(db)?.sourceId,
            server: url,
            generation: this.store.get(`generation:${name}:${target.contentId}`, 0),
          })
        )
        .digest("hex");
      const created = await this.client.request<{ id: string }>(url, "/v1/documents", "POST", {
        idempotencyKey,
      });
      const contracts = session.doc
        .getMap("node-tree:contracts")
        .toJSON() as ContentContractDictionary;
      const baselineId = randomUUID();
      const value = await this.assets.shareDocument(
        url,
        previousId,
        created.id,
        readNodeDocument(session.doc),
        contracts
      );
      const candidate = await createNodeDocument(
        { documentId: created.id, baselineId, epoch: 0 },
        value,
        contracts
      );
      try {
        prepared = {
          documentId: created.id,
          baselineId,
          state: Buffer.from(Y.encodeStateAsUpdate(candidate)).toString("base64"),
          revision: contentRevision(session),
          serverUrl: url,
        };
        body.rememberShare(previousId, prepared);
      } finally {
        candidate.destroy();
      }
    }
    if (prepared.serverUrl !== url || prepared.revision !== contentRevision(session))
      throw new Error("共享准备后原正文已变化，原状态已保留，请重新打开后重试");
    await this.client.request(url, `/v1/documents/${prepared.documentId}/publish`, "POST", {
      state: prepared.state,
    });
    const remote = await this.client.request<{ state: string }>(
      url,
      `/v1/documents/${prepared.documentId}/state`,
      "GET",
      undefined,
      NODE_DOCUMENT_VERSION
    );
    const existing = this.sessions.get(prepared.documentId);
    const doc = existing?.doc ?? new Y.Doc({ gc: false });
    try {
      Y.applyUpdate(doc, Buffer.from(remote.state, "base64"), existing?.provider);
      await validateNodeDocument(doc, {
        documentId: prepared.documentId,
        baselineId: prepared.baselineId,
        epoch: 0,
      });
      const value = await this.assets.localizeDocument(
        url,
        prepared.documentId,
        readNodeDocument(doc),
        doc.getMap("node-tree:contracts").toJSON() as ContentContractDictionary
      );
      if (!db.open || databaseModule.getDatabase(name) !== db)
        throw new Error("资料库已切换，共享结果待恢复");
      const info: CollaborationSession = {
        ...session.info,
        id: prepared.documentId,
        mode: "shared",
        serverUrl: url,
        ownerId: identity.id,
        role: "owner",
        source,
        pending: existing?.info.pending ?? false,
        frozen: false,
        leaving: false,
        connection: "connecting",
        error: undefined,
      };
      db.transaction(() => {
        const current = ContentDocumentTable.read(db, source.contentId);
        const binding = findCollaborationBinding(db, source.contentId);
        if (binding && binding.document_id !== prepared!.documentId)
          throw new Error("正文已关联另一份共享");
        if (!current || current.documentId !== stored.documentId)
          throw new Error("原正文身份已变化");
        ContentDocumentTable.commit(
          db,
          source.contentId,
          {
            documentId: stored.documentId,
            contracts: doc.getMap("node-tree:contracts").toJSON() as ContentContractDictionary,
            content: value.content,
          },
          {
            installDocument: true,
            expectedRevision: stored.revision,
            count: getContentLength(value.content as import("slate").Descendant[]),
          }
        );
        db.prepare("INSERT OR REPLACE INTO collaboration_bindings VALUES (?,?,?,?,?,?,?)").run(
          source.contentId,
          source.contentCreatedAt,
          url,
          prepared!.documentId,
          source.sourceType ?? null,
          source.sourceId ?? null,
          source.sourceTitle ?? null
        );
      })();
      source.projectionRevision = ContentDocumentTable.read(db, source.contentId)!.revision;
      if (existing) {
        Object.assign(existing.info, info);
        this.store.metadata(existing.info);
        registerContentSession(db, source.contentId, existing);
      } else {
        // 刚发布的房间以远端确认快照为准，同 ID 的冷缓存只可能是旧残留
        this.store.discard(info.id, "发布时发现同房间的旧缓存");
        source.projectionRevision = ContentDocumentTable.read(db, source.contentId)!.revision;
        this.store.create(info, doc);
        this.restore(info, doc);
      }
      await body.finishShare(session);
      body.clearPendingShare(previousId);
      this.changed();
      return { documentId: info.id, code: (await this.issueInvitation(url, info.id)).code };
    } catch (failure) {
      if (!existing && this.sessions.get(prepared.documentId)?.doc !== doc) doc.destroy();
      throw failure;
    }
  }

  /**
   * 结束共享后把当前正文与资源保存到本机，并创建独立的本机会话身份。
   */
  private async demoteSession(session: RuntimeSession) {
    const source = session.info.source;
    if (!source) throw new Error("这段内容没有关联的本地内容，无法转为本机编辑");
    const db = databaseModule.getDatabase(source.databaseName);
    if (!db?.open) throw new Error("请打开原内容所在数据库以完成结束共享");
    const serverUrl = session.info.serverUrl;
    const previousId = session.info.id;
    if (session.doc.getMap("meta").get("version") === NODE_DOCUMENT_VERSION) {
      if (!bindingMatches(db, source, previousId, serverUrl)) {
        await this.removeSession(session);
        return;
      }
      const stored = ContentDocumentTable.read(db, source.contentId);
      if (!stored) throw new Error("CONTENT_FORMAT_UNSUPPORTED: 正文格式不受支持");
      const expectedRevision = source.projectionRevision;
      if (
        stored.revision !== expectedRevision ||
        (source.contentDocumentId && stored.documentId !== source.contentDocumentId) ||
        (source.librarySourceId &&
          ContentIdentityTable.library(db)?.sourceId !== source.librarySourceId)
      )
        throw new Error("最终正文的来源或修订已变化，已保留共享副本");
      const nextId = localSessionId(db.name, source.contentId, source.contentCreatedAt);
      const body = this.localRuntime ?? this;
      if (body.find(nextId)) throw new Error("本机正文仍在编辑，请稍后重试");
      // 共享期间的本机冷缓存早于共享内容，备份后让位给结束共享的最终正文
      body.discardCache(nextId, "结束共享时发现旧本机缓存");
      const contracts = session.doc
        .getMap("node-tree:contracts")
        .toJSON() as ContentContractDictionary;
      const value = await this.assets.localizeDocument(
        serverUrl,
        previousId,
        readNodeDocument(session.doc),
        contracts
      );
      const baselineId = randomUUID(),
        epoch = Number(session.doc.getMap("meta").get("epoch")) + 1;
      const doc = await createNodeDocument(
        { documentId: nextId, baselineId, epoch },
        await this.assets.prepareLocalDocument(nextId, value, contracts),
        contracts,
        { allowLocalResources: true }
      );
      try {
        if (!db.open || databaseModule.getDatabase(source.databaseName) !== db)
          throw new Error("资料库已切换，请在原资料库重试");
        db.transaction(() => {
          if (!bindingMatches(db, source, previousId, serverUrl)) throw new Error("正文绑定已变化");
          ContentDocumentTable.commit(
            db,
            source.contentId,
            { documentId: stored.documentId, contracts, content: value.content },
            {
              installDocument: true,
              expectedRevision,
              count: getContentLength(value.content as import("slate").Descendant[]),
            }
          );
          db.prepare("DELETE FROM collaboration_bindings WHERE content_id=? AND document_id=?").run(
            source.contentId,
            previousId
          );
        })();
        const info: CollaborationSession = {
          ...session.info,
          id: nextId,
          mode: "local",
          serverUrl: "",
          ownerId: "local",
          role: "owner",
          status: "active",
          members: [],
          frozen: false,
          leaving: false,
          pending: false,
          error: undefined,
          connection: "connected",
        };
        source.projectionRevision = ContentDocumentTable.read(db, source.contentId)!.revision;
        body.install(info, doc);
        this.store.set(
          `generation:${source.databaseName}:${source.contentId}`,
          this.store.get(`generation:${source.databaseName}:${source.contentId}`, 0) + 1
        );
        await this.removeSession(session);
        return;
      } catch (failure) {
        if (body.find(nextId)?.doc !== doc) doc.destroy();
        throw failure;
      }
    }
    throw new Error("CONTENT_FORMAT_UNSUPPORTED: 正文格式不受支持");
  }

  /** 服务器只存码的哈希，明文仅签发时返回一次：缓存到本机供作者随时重新复制 */
  private async issueInvitation(serverUrl: string, documentId: string) {
    const invitation = await this.client.request<{ code: string; expiresAt: number }>(
      serverUrl,
      `/v1/documents/${encodeURIComponent(documentId)}/invitation`,
      "POST",
      {}
    );
    this.store.set(`invitation:${documentId}`, invitation);
    return invitation;
  }

  private async flushResources() {
    if (this.syncingResources) return;
    this.syncingResources = true;
    try {
      for (const session of this.sessions.values()) {
        if (
          session.info.leaving ||
          session.info.status !== "active" ||
          !this.assets.hasPending(session.info.id)
        )
          continue;
        try {
          await this.assets.flush(session.info.serverUrl, session.info.id);
          if (
            session.info.status === "active" &&
            !session.info.leaving &&
            !this.assets.hasPending(session.info.id)
          )
            session.provider?.attach();
        } catch (error) {
          session.info.error = error instanceof Error ? error.message : "资源上传失败";
          this.changed(session);
        }
      }
    } finally {
      this.syncingResources = false;
    }
  }

  protected override async readSharedAgentState(session: RuntimeSession) {
    const remote = await this.client.request<{ state: string }>(
      session.info.serverUrl,
      `/v1/documents/${session.info.id}/state`,
      "GET",
      undefined,
      NODE_DOCUMENT_VERSION
    );
    return Buffer.from(remote.state, "base64");
  }

  protected override async submitSharedAgentEdit(
    session: RuntimeSession,
    request: ScopedContentSubmission,
    updateHash: string,
    check: () => void,
    { signal, undo }: ScopedWriteOptions
  ): Promise<ScopedContentResult> {
    const route = `/v1/documents/${session.info.id}/operations/${request.operationId}`;
    const url = session.info.serverUrl;
    const key = `scoped-edit-request:${url}:${session.info.id}:${request.operationId}`;
    const known = this.store.get<{ updateHash: string; expiresAt: number } | null>(key, null);
    if (known && known.updateHash !== updateHash) throw new Error("操作身份已被另一请求使用");
    if (!known) {
      await this.client.request(url, `/v1/documents/${session.info.id}/protocol`);
      check();
      if (session.info.pending || session.provider?.hasUnsyncedChanges) {
        try {
          await buildScopedContentUpdate(session.doc, request.scope, { undo });
        } catch (error) {
          if (error instanceof ScopedContentConflictError)
            return { status: "conflict", conflicts: error.conflicts };
          if (error instanceof ScopedUndoLimitError)
            return { status: "rejected", reason: error.code };
          throw error;
        }
      }
      check();
    }
    const expiresAt = known?.expiresAt ?? this.client.serverTime(url) + 4 * 60_000;
    if (!known) this.store.set(key, { updateHash, expiresAt });
    let operation: DocumentOperation | null;
    const envelope = {
      kind: "scoped-edit",
      version: NODE_DOCUMENT_VERSION,
      baselineId: request.baselineId,
      epoch: request.epoch,
      expiresAt,
      updateHash,
    };
    const cancel = () => {
      // 已进入提交事务的请求仍以原操作回执为准。
      void this.client.request(url, `${route}/cancel`, "POST", envelope).catch(() => undefined);
    };
    check();
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      ({ operation } = await this.client.request<{ operation: DocumentOperation | null }>(
        url,
        route,
        "POST",
        {
          ...envelope,
          scope: request.scope,
        }
      ));
    } catch (error) {
      const failure = error as { status?: number; code?: string };
      try {
        ({ operation } = await this.client.request<{ operation: DocumentOperation | null }>(
          url,
          route
        ));
      } catch {
        if (failure.status === 401 || failure.status === 403)
          return { status: "rejected", reason: failure.code ?? "FORBIDDEN" };
        return { status: "pending" };
      }
      if (!operation && failure.status && failure.status < 500 && failure.status !== 429)
        return { status: "rejected", reason: failure.code ?? "INVALID_OPERATION" };
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
    if (operation?.state === "COMMITTED")
      return { status: "committed", inverse: operation.receipt?.inverse };
    if (operation?.conflicts) return { status: "conflict", conflicts: operation.conflicts };
    if (operation?.state === "ABORTED" || operation?.state === "EXPIRED")
      return { status: "rejected", reason: operation.reason ?? operation.state };
    return { status: "pending" };
  }

  protected override async preserveOwnerImages(
    session: RuntimeSession,
    references?: Iterable<string>
  ) {
    if (session.info.mode === "local" || session.info.role !== "owner") return;
    try {
      const preserved = await this.assets.preserveOwnerImages(
        session.info.serverUrl,
        session.info.id,
        references ?? collectNodeDocumentResources(session.doc),
        async file => {
          const reference = await collaborationImageStorage.save(file);
          if (this.sessions.get(session.info.id) !== session) throw new Error("作者正文会话已变化");
          return reference;
        }
      );
      if (preserved.length && session.projectionVersion) {
        session.projectionStructure = ++session.projectionVersion.content;
        session.projectionDirty = true;
      }
    } catch (error) {
      throw new Error(
        `作者图片尚未保存：${error instanceof Error ? error.message : String(error)}`
      );
    }
    if (session.info.error?.startsWith("作者图片尚未保存：")) {
      session.info.error = undefined;
      this.changed(session);
    }
  }

  /** 解除本地绑定并递增发布代次。discard=true（丢弃本地改动退出）时跳过最后的
   *  投影与进行中检查——丢弃语义下不应再写库，绑定清理必须尽力完成。 */
  private async clearBinding(session: RuntimeSession, discard = false) {
    const source = session.info.source;
    if (!source) return;
    const db = databaseModule.getDatabase(source.databaseName);
    if (!db?.open) throw new Error("请打开原内容所在数据库以完成退出");
    if (!session.info.frozen) await this.freeze(session);
    if (!discard && this.projecting.has(session.info.id))
      throw new Error("内容正在保存，请稍后再重试");
    // 原内容已不再由这份共享绑定（被删除重建 / 改绑其它共享）：没有可写回的对象，
    // 直接解除本共享的残留记录——否则写回必然失败，清理永远卡住
    const bound = bindingMatches(db, source, session.info.id, session.info.serverUrl);
    if (!discard && bound) await this.project(session);
    db.prepare("DELETE FROM collaboration_bindings WHERE content_id=? AND document_id=?").run(
      source.contentId,
      session.info.id
    );
    this.store.set(
      "generation:" + source.databaseName + ":" + source.contentId,
      this.store.get("generation:" + source.databaseName + ":" + source.contentId, 0) + 1
    );
    session.info.source = undefined;
    unregisterContentSession(session);
  }
  private async discardLocal(session: RuntimeSession) {
    if (session.info.source) await this.clearBinding(session);
    await this.removeSession(session);
  }
  protected override async removeSession(session: RuntimeSession) {
    this.remoteDocuments.get(session.info.serverUrl)?.delete(session.info.id);
    await super.removeSession(session);
  }
  private async revoke(session: RuntimeSession, reason: "closed" | "revoked") {
    if (session.info.leaving) return;
    session.provider?.detach();
    session.info.status = "closed";
    session.info.connection = "offline";
    session.info.error = reason === "closed" ? "作者已结束共享" : "访问权限已被移除";
    if (session.info.source) {
      try {
        await this.clearBinding(session);
      } catch {
        this.changed(session);
        return;
      }
    }
    if (session.info.pending) {
      this.changed(session);
      return;
    }
    await this.removeSession(session);
  }
  private async finishLeave(session: RuntimeSession) {
    const closingId = session.info.id;
    if (this.finishingLeaves.has(closingId)) return;
    this.finishingLeaves.add(closingId);
    const closeConfirmed = this.store.get(`close-confirmed:${closingId}`, false);
    let closeAttempted = closeConfirmed || this.store.get(`close-attempted:${closingId}`, false);
    try {
      if (session.info.role === "owner") {
        if (!closeConfirmed) {
          const revision = this.store.get<string | undefined>(
            `close-revision:${closingId}`,
            undefined
          );
          if (!revision) throw new Error("尚未确认最终共享快照，请重新结束共享");
          await this.persistBeforeClose(session);
          this.store.set(`close-attempted:${closingId}`, true);
          closeAttempted = true;
          await this.client.request(
            session.info.serverUrl,
            `/v1/documents/${session.info.id}/close`,
            "POST",
            {
              expectedRevision: revision,
            }
          );
          this.store.set(`close-confirmed:${closingId}`, true);
        }
        // 作者结束共享：本机还有这篇内容，会话降级回本机继续编辑（同一个 Y.Doc）；
        // 没有本地内容（源已删除等）才拆除会话
        if (session.info.source) {
          await this.demoteSession(session);
          this.unfreeze(session);
        } else await this.removeSession(session);
      } else {
        await this.client.request(
          session.info.serverUrl,
          `/v1/documents/${session.info.id}/leave`,
          "POST",
          {}
        );
        await this.removeSession(session);
      }
    } catch (error) {
      if (!closeAttempted || (error as { code?: string }).code === "REVISION_CONFLICT") {
        session.info.leaving = false;
        this.store.delete(`close-revision:${closingId}`);
        this.store.delete(`close-attempted:${closingId}`);
        this.unfreeze(session);
        session.provider?.attach();
      }
      session.info.error = error instanceof Error ? error.message : "正在等待退出完成";
      this.changed(session);
    } finally {
      this.finishingLeaves.delete(closingId);
    }
  }

  private async persistBeforeClose(session: RuntimeSession) {
    if (this.projecting.has(session.info.id)) throw new Error("正文正在保存，请稍后重试");
    const source = session.info.source;
    if (!source) throw new Error("原正文关联缺失，请打开原资料库后重试结束共享");
    if (!databaseModule.getDatabase(source.databaseName)?.open)
      throw new Error("请打开原内容所在数据库以完成结束共享");
    await this.project(session);
    if (this.sessions.get(session.info.id) !== session || session.projectionDirty)
      throw new Error("最终正文尚未确认保存，请重试结束共享");
    this.store.compact(session.info.id, session.doc);
    this.store.metadata(session.info);
  }

  documentClient(): CollaborationClient {
    if (!this.client) throw new Error("文档传输服务未就绪");
    return this.client;
  }

  private async releaseRemoteSession(session: RuntimeSession, reason: string) {
    const id = session.info.id;
    for (const [viewId, view] of this.views) if (view.documentId === id) this.removeView(viewId);
    unregisterContentSession(session);
    session.provider?.destroy();
    if (session.dirty) this.store.compact(id, session.doc);
    this.store.discard(id, reason);
    session.awareness.destroy();
    session.doc.destroy();
    this.sessions.delete(id);
    this.contentState?.db.prepare("DELETE FROM entity_holds WHERE holder=?").run(`document:${id}`);
    this.broadcast("collaboration:removed", { documentId: id, replaced: true });
  }

  override async init() {
    this.directory = join(PathUtil.getAppDir(), "collaboration");
    this.store = new CollaborationLocalStore(this.directory);
    this.contentState = new ContentLocalState(this.store.db);
    this.client = new CollaborationClient(this.store);
    this.assets = new CollaborationAssetService(this.store, PathUtil.getAppDir(), url =>
      this.client.identity(url)
    );
    this.localRuntime = localContent;
    // 打不开的缓存由 loadCached 备份后丢弃，共享会话随后按远端快照重建，本机正文按主库重建
    for (const info of this.store.list()) {
      if (
        info.mode !== "local" &&
        (info.role === "owner" || info.pending || info.leaving || this.assets.hasPending(info.id))
      )
        this.loadCached(info.id, info);
    }
    this.initDurability();
    registerCollaborationIpc({
      nodeUpdates: this.contentUpdates(),
      store: this.store,
      contentState: this.contentState,
      client: this.client,
      assets: this.assets,
      serverUrl: () => this.serverUrl,
      sessions: this.sessions,
      findSession: id => this.findSession(id) ?? this.localRuntime?.find(id),
      views: this.views,
      state: this.state.bind(this),
      changed: this.changed.bind(this),
      refresh: this.refresh.bind(this),
      databaseForEvent: this.databaseForEvent.bind(this),
      requireSession: this.requireSession.bind(this),
      roomAddress: this.roomAddress.bind(this),
      openRoom: this.openRoom.bind(this),
      openContent: this.openSharedContent.bind(this),
      acknowledgeFreeze: this.acknowledgeFreeze.bind(this),
      prepareLeave: this.prepareLeave.bind(this),
      createContent: this.createContent.bind(this),
      issueInvitation: this.issueInvitation.bind(this),
      removeView: this.removeView.bind(this),
      presenceSnapshot: session => localContent.agent.presenceSnapshot(session),
      clearBinding: this.clearBinding.bind(this),
      discardLocal: this.discardLocal.bind(this),
      removeSession: this.removeSession.bind(this),
      finishLeave: this.finishLeave.bind(this),
      flushResources: this.flushResources.bind(this),
    });
    localContent.connectSharing({
      open: this.openSharedContent.bind(this),
      find: this.findSession.bind(this),
      findContent: this.findContent.bind(this),
      readAgentState: this.readSharedAgentState.bind(this),
      submitAgentEdit: this.submitSharedAgentEdit.bind(this),
      broadcastPresence: (documentId, update) =>
        this.broadcast("collaboration:awareness", { documentId, update }),
      windows: id => this.removeWindowViews(id),
    });
    this.startAutoFlush();
    this.refreshInterval = setInterval(() => void this.refresh(), 15000);
    this.refreshInterval.unref();
    void this.refresh();
  }

  /** 受控退出收尾：停止后台任务并断开所有协作连接 */
  override shutdown(): void {
    this.localRuntime?.disconnectSharing();
    super.shutdown();
    this.stopped = true;
    this.remoteDocuments.clear();
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    for (const socket of this.events.values()) socket.close();
    for (const transport of this.transports.values()) transport.disconnect();
    this.contentState = undefined;
  }
}

export default new CollaborationManager();
