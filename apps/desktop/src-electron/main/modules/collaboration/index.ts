import { readDocumentIdentity } from "@tau/collaboration";
import { applyNodeTreeContent } from "@tau/editor-collab";
import { NodeSessionUpdates } from "./node-session-updates";
import {
  hasDurableDocuments,
  prepareDurableDocuments,
  registerDurableDocuments,
  type DocumentDrain,
  type DocumentDrainScope,
} from "../durable-document-lifecycle";
import { app, BrowserWindow, type IpcMainInvokeEvent } from "electron";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { WebSocket } from "ws";
import * as Y from "yjs";
import { Awareness, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import { createHash, randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { basename, join } from "node:path";
import {
  DEFAULT_COLLABORATION_URL,
  SOURCE_TYPES,
  replaceText,
  NODE_DOCUMENT_VERSION,
  WHITEBOARD_DOCUMENT_VERSION,
  readNodeDocument,
  createNodeDocument,
  validateNodeDocument,
  NodeTree,
  collectNodeDocumentResources,
  ASSET_PREFIX,
  type ContentSessionTarget,
  type ContentSessionSnapshot,
  type CollaborationEvent,
  type CollaborationSession,
  type CollaborationState,
  type ContentNode,
  type JoinRequest,
  type SharedDocumentInfo,
  type SharedWhiteboardInfo,
  type SourceBinding,
  type SourceType,
} from "@tau/collaboration";
import PathUtil from "../../utils/PathUtil";
import databaseModule from "../database";
import ContentTable from "../tables/content";
import { ContentDocumentTable } from "../tables/content-document";
import { repairContentForOpen } from "../content-repair";
import { ContentIdentityTable } from "../tables/content-identity";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import {
  CONTENT_ENTITY_NODE_CONTRACTS,
  isContentEntityReference,
  type ContentEntityReference,
} from "@tau/db-schema/content-identities";
import { bindingMatches, planClosedReshare, restoreContentBinding } from "./content-repository";
import { CollaborationAssetService } from "./asset-service";
import { CollaborationClient } from "./client";
import { registerCollaborationIpc } from "./ipc-controller";
import type { RuntimeSession, CollaborationView } from "./types";
import { getContentLength } from "@/utils/helper";
import { CollaborationLocalStore } from "./local-store";
import { ContentLocalState } from "./content-local-state";
import { ContentRetention } from "./content-retention";
import { registerDurableEntityHolds } from "../durable-entity-holds";
import { getDevelopmentServerUrl } from "./dev-server";
import { findCollaborationBinding } from "../collaboration-guard";
import { emitContentWritten } from "../content-events";
import { localSessionId } from "./session-identity";
import {
  findContentTitle,
  projectContentTitle,
  projectContractContent,
  registerContentSession,
  contentSession,
  unregisterContentSession,
  contentRevision,
} from "./content-sessions";

export class CollaborationManager {
  name = "collaboration";
  private store!: CollaborationLocalStore;
  private contentState?: ContentLocalState;
  private stopContentRetention?: () => void;
  private stopDocumentDrain?: () => void;
  private assets!: CollaborationAssetService;
  private client!: CollaborationClient;
  private projecting = new Set<string>();
  private directory = "";
  private sessions = new Map<string, RuntimeSession>();
  private transports = new Map<string, HocuspocusProviderWebsocket>();
  private events = new Map<string, WebSocket>();
  private views = new Map<string, CollaborationView>();
  private requests: JoinRequest[] = [];
  private refreshing = false;
  private readonly nonContentRooms = new Set<string>();
  /** 最近一次刷新得到的各服务器共享文档 ID，用于判定残留绑定。 */
  private readonly remoteDocuments = new Map<string, Set<string>>();
  /** 白板房间按 `${url}/${id}` 记录成员与角色，内容由白板文档会话同步。 */
  private readonly whiteboardRooms = new Map<string, SharedWhiteboardInfo>();
  private syncingResources = false;
  private error?: string;
  private stopped = false;
  private pendingCreates = new Map<string, Promise<{ documentId: string; code: string }>>();
  private freezeWaiters = new Map<string, { id: string; resolve(): void }>();
  private closeWaiters = new Map<string, () => void>();
  private closingWindows = new Set<number>();
  private finishingLeaves = new Set<string>();
  private autoFlushInterval: ReturnType<typeof setInterval> | null = null;
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private quitting = false;

  private get serverUrl() {
    return getDevelopmentServerUrl() || DEFAULT_COLLABORATION_URL;
  }
  private get nickname() {
    return this.store.get("nickname", "Tau 用户");
  }
  private state(): CollaborationState {
    return {
      serverUrl: this.serverUrl,
      nickname: this.nickname,
      deviceId: this.client.identities.get(this.serverUrl)?.id,
      sessions: [...this.sessions.values()]
        .filter(session => session.info.mode !== "local")
        .map(session => session.info),
      whiteboards: [...this.whiteboardRooms.values()],
      requests: this.requests,
      error: this.error,
    };
  }
  /** 白板房间的服务地址；未出现在本机已加入列表中的房间不签发协作码。 */
  whiteboardRoom(id: string): SharedWhiteboardInfo | undefined {
    return [...this.whiteboardRooms.values()].find(room => room.id === id);
  }
  /** 白板发布或加入后立即刷新房间列表，避免等待定时刷新。 */
  refreshShared(): Promise<void> {
    return this.refresh();
  }
  private broadcast(channel: string, value: unknown) {
    const documentId = (value as { documentId?: string })?.documentId;
    const targeted =
      documentId &&
      ["collaboration:update", "collaboration:awareness", "collaboration:freeze"].includes(channel);
    const subscribers = targeted
      ? new Set(
          [...this.views.values()]
            .filter(view => view.documentId === documentId)
            .map(view => view.windowId)
        )
      : undefined;
    for (const window of BrowserWindow.getAllWindows())
      if (!window.isDestroyed() && (!subscribers || subscribers.has(window.id)))
        window.webContents.send(channel, value);
  }
  private changed(session?: RuntimeSession) {
    if (session) this.store.metadata(session.info);
    if (session?.info.mode === "local") {
      this.broadcast("collaboration:session-error", {
        documentId: session.info.id,
        error: session.info.error,
      });
      return;
    }
    this.broadcast("collaboration:state", this.state());
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
  private attach(session: RuntimeSession) {
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
  private restore(info: CollaborationSession, doc: Y.Doc) {
    if (doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION)
      throw new Error("CONTENT_FORMAT_UNSUPPORTED: 正文格式不受支持");
    if (info.source && !Number.isSafeInteger(info.source.contentCreatedAt))
      info.source = this.findLocalSource(info.id, info.serverUrl);
    const session: RuntimeSession = {
      info: {
        ...info,
        frozen: Boolean(
          info.remoteVersionAvailable || this.store.get(`publishing:${info.id}`, null)
        ),
        connection: info.mode === "local" ? "connected" : "connecting",
      },
      doc,
      awareness: new Awareness(doc),
      assets: this.assets,
      store: this.store,
      dirty: true,
      projectionDirty: true,
    };
    session.awareness.setLocalState(null);
    // 广播与落盘一律读 session.info.id：发起或结束共享会换 documentId，
    // 捕获创建时的 info.id 会让换身份之后的更新写错会话
    session.awareness.on(
      "update",
      ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
        this.broadcast("collaboration:awareness", {
          documentId: session.info.id,
          update: encodeAwarenessUpdate(session.awareness, [...added, ...updated, ...removed]),
        });
      }
    );
    this.sessions.set(info.id, session);
    session.replaceContent = (content, contracts, expectedRevision) =>
      this.replaceContentSnapshot(session, content, contracts, expectedRevision);
    session.persistNodeUpdate = update => this.store.append(session.info.id, update);
    session.retainNodeState = candidate => this.retainNodeState(session, candidate);
    this.retainNodeState(session, doc);
    doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin !== "renderer-persisted") this.store.append(session.info.id, update);
      session.dirty = true;
      session.projectionDirty = true;
      try {
        this.retainNodeState(session, doc);
      } catch (failure) {
        session.info.error = failure instanceof Error ? failure.message : "实体持有记录尚未保存";
        this.changed(session);
      }
      if (session.info.mode !== "local" && origin !== session.provider) session.info.pending = true;
      const title = doc.getText("title").toString();
      if (session.info.title !== title) {
        session.info.title = title;
        this.changed(session);
      }
      this.store.metadata(session.info);
      this.broadcast("collaboration:update", { documentId: session.info.id, update });
      this.broadcast("collaboration:content", {
        documentId: session.info.id,
        source: session.info.source,
        title,
      });
      const source = session.info.source;
      const db = source && databaseModule.getDatabase(source.databaseName);
      if (db?.open && contentSession(db, source!.contentId) === session)
        ContentTable.ensureTaskIds(db, source!.contentId);
    });
    const source = session.info.source;
    const db = source && databaseModule.getDatabase(source.databaseName);
    if (db?.open && source) {
      registerContentSession(db, source.contentId, session);
      if (session.info.status === "active") ContentTable.ensureTaskIds(db, source.contentId);
    }
    this.attach(session);
    return session;
  }
  private retainNodeState(session: RuntimeSession, doc: Y.Doc) {
    if (doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION) return;
    if (!this.contentState) throw new Error("本机持有服务尚未就绪");
    const tree = new NodeTree(doc);
    try {
      const references: ContentEntityReference[] = [];
      for (const id of tree.nodes.keys()) {
        const contract = tree.contract(id);
        const entity = contract && CONTENT_ENTITY_NODE_CONTRACTS[contract.type];
        if (!contract || !entity || contract.owner !== entity.owner) continue;
        const reference = tree.properties(id).get("entityRef");
        if (!isContentEntityReference(reference) || reference.kind !== entity.kind)
          throw new Error("实体引用缺少稳定来源身份");
        references.push(reference);
      }
      this.contentState.replaceHolds(
        session.info.source?.databaseName ?? "application",
        `document:${session.info.id}`,
        session.info.mode === "local" ? "undo" : "shared-membership",
        [
          ...this.contentState.holders(
            session.info.source?.databaseName ?? "application",
            `document:${session.info.id}`
          ),
          ...references,
        ]
      );
    } finally {
      tree.dispose();
    }
  }
  private findSession(id: string): RuntimeSession | undefined {
    return this.sessions.get(id) ?? this.loadCached(id);
  }
  /** 恢复冷缓存；打不开的缓存备份后丢弃并返回 undefined，由调用方按远端或主库重建。 */
  private loadCached(id: string, info?: CollaborationSession): RuntimeSession | undefined {
    if (!this.store?.db.prepare("SELECT 1 FROM sessions WHERE id=?").get(id)) return undefined;
    let doc: Y.Doc | undefined;
    try {
      const cached = this.store.load(id);
      doc = cached.doc;
      return this.restore(info ?? cached.info, doc);
    } catch (error) {
      const partial = this.sessions.get(id);
      if (partial && partial.doc === doc) {
        unregisterContentSession(partial);
        partial.awareness.destroy();
        this.sessions.delete(id);
      }
      doc?.destroy();
      const reason = error instanceof Error ? error.message : "协作缓存无法打开";
      console.warn(`[collaboration] 会话 ${id} 缓存无法打开，已备份并丢弃后重建`, error);
      this.store.discard(id, reason);
      this.contentState?.db
        .prepare("DELETE FROM entity_holds WHERE holder=?")
        .run(`document:${id}`);
      return undefined;
    }
  }
  private requireSession(id: string): RuntimeSession {
    const session = this.findSession(id);
    if (!session || session.info.leaving) throw new Error("这段内容已退出协作");
    return session;
  }

  private async openContent(
    event: IpcMainInvokeEvent | { db: import("better-sqlite3").Database; name: string },
    target: ContentSessionTarget
  ): Promise<ContentSessionSnapshot> {
    const { db, name } = this.databaseForEvent(event);
    if (target.sourceType && !SOURCE_TYPES.includes(target.sourceType))
      throw new Error("不支持的内容来源，请升级客户端");
    if (!Number.isSafeInteger(target.contentId) || target.contentId <= 0)
      throw new Error("内容 ID 不合法");
    const content = ContentTable.getContentById(db, target.contentId);
    if (!content) throw new Error("内容不存在");
    const binding = findCollaborationBinding(db, target.contentId);
    const id = binding?.document_id || localSessionId(db.name, content.id, content.createTime);
    let session = this.findSession(id);
    // 本地缓存的资料库或正文身份与主库不一致（如同步替换后的冷缓存）：丢弃旧缓存，从当前主库重建
    if (session?.info.mode === "local" && session.info.source) {
      const source = session.info.source;
      if (
        (source.librarySourceId &&
          source.librarySourceId !== ContentIdentityTable.library(db)?.sourceId) ||
        (source.contentDocumentId &&
          source.contentDocumentId !== ContentDocumentTable.read(db, content.id)?.documentId)
      ) {
        await this.releaseReplacedSession(session);
        return this.openContent(event, target);
      }
      // 主库在缓存之后被其它入口改写（插件、MCP、任务改名等）：旧缓存不能盖住新内容。
      // 先试着把缓存未投影的编辑写回；修订已冲突时备份缓存后按主库重建。
      const stored = ContentDocumentTable.read(db, content.id);
      if (
        stored &&
        source.projectionRevision !== stored.revision &&
        ![...this.views.values()].some(view => view.documentId === id)
      ) {
        try {
          await this.project(session);
        } catch (error) {
          if (ContentDocumentTable.read(db, content.id)?.revision === source.projectionRevision)
            throw error;
          console.warn(`[collaboration] 正文 ${content.id} 的缓存落后于主库，已备份后按主库重建`);
          await this.releaseReplacedSession(session, "主库在缓存之后被改写");
          return this.openContent(event, target);
        }
      }
    }
    if (binding && !session) {
      await this.refresh();
      session = this.findSession(id);
      // 服务器已确认不再有这份共享：解除残留绑定，按主库正文转为本机编辑
      if (!session && this.remoteDocuments.get(binding.server_url)?.has(id) === false) {
        db.prepare("DELETE FROM collaboration_bindings WHERE content_id=? AND document_id=?").run(
          content.id,
          id
        );
        return this.openContent(event, target);
      }
      if (!session) throw new Error("协作会话尚未恢复，请稍后重试");
    }
    if (!session) {
      if (
        await repairContentForOpen(
          db,
          name,
          content.id,
          () => databaseModule.getDatabase(name) === db
        )
      )
        return this.openContent(event, target);
      const source: SourceBinding = {
        ...target,
        databaseName: name,
        contentId: content.id,
        contentCreatedAt: content.createTime,
      };
      const title =
        target.sourceType !== "card" && target.sourceTitle !== undefined
          ? target.sourceTitle
          : findContentTitle(db, content.id);
      const stored = ContentDocumentTable.read(db, content.id);
      if (stored) {
        source.librarySourceId = ContentIdentityTable.library(db)?.sourceId;
        source.contentDocumentId = stored.documentId;
        source.projectionRevision = stored.revision;
        if (!source.librarySourceId) throw new Error("正文缺少资料库来源身份");
      }
      const value = {
        title,
        content: content.content as ContentNode[],
        bannerBg: "",
        bannerPosition: "center",
      };
      if (!stored) throw new Error("CONTENT_FORMAT_UNSUPPORTED: 正文格式不受支持");
      const doc = await createNodeDocument(
        { documentId: id, baselineId: randomUUID(), epoch: 0 },
        await this.assets.prepareLocalDocument(id, value, stored.contracts),
        stored.contracts
      );
      if (!db.open || databaseModule.getDatabase(name) !== db) {
        doc.destroy();
        throw new Error("资料库已切换，请重新打开内容");
      }
      const concurrent = this.findSession(id);
      if (concurrent) {
        doc.destroy();
        return this.openContent(event, target);
      }
      if (stored && ContentDocumentTable.read(db, content.id)?.revision !== stored.revision) {
        doc.destroy();
        throw new Error("正文在打开期间已变化，请重试");
      }
      const info: CollaborationSession = {
        id,
        mode: "local",
        source,
        title,
        ownerId: "local",
        role: "owner",
        status: "active",
        members: [],
        updatedAt: Date.now(),
        serverUrl: "",
        connection: "connected",
        pending: false,
        leaving: false,
      };
      this.store.create(info, doc);
      session = this.restore(info, doc);
    }
    if (session.info.source?.contentCreatedAt !== content.createTime)
      throw new Error("原内容关联已变化");
    registerContentSession(db, content.id, session);
    ContentTable.ensureTaskIds(db, content.id);
    return {
      documentId: id,
      mode: session.info.mode || "shared",
      title: session.doc.getText("title").toString(),
      frozen: Boolean(session.info.frozen),
      source: session.info.source,
    };
  }

  private acknowledgeFreeze(viewId: string, requestId?: string) {
    const view = this.views.get(viewId);
    const session = view && this.sessions.get(view.documentId);
    const waiter = session && this.freezeWaiters.get(session.info.id);
    if (waiter ? waiter.id !== requestId : requestId !== undefined) return;
    this.closeWaiters.get(viewId)?.();
    if (!session?.drainingViews) return;
    session.drainingViews.delete(viewId);
    if (!session.drainingViews.size) waiter?.resolve();
  }

  private async freeze(session: RuntimeSession) {
    if (session.info.frozen) throw new Error("内容正在切换，请稍后重试");
    session.info.frozen = true;
    const requestId = randomUUID();
    session.drainingViews = new Set(
      [...this.views].filter(([, view]) => view.documentId === session.info.id).map(([id]) => id)
    );
    const drained = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("有编辑窗口未完成保存，请稍后重试")),
        10000
      );
      this.freezeWaiters.set(session.info.id, {
        id: requestId,
        resolve: () => {
          clearTimeout(timeout);
          resolve();
        },
      });
      if (!session.drainingViews?.size) this.freezeWaiters.get(session.info.id)?.resolve();
    });
    this.broadcast("collaboration:freeze", {
      documentId: session.info.id,
      frozen: true,
      requestId,
    });
    try {
      await drained;
    } catch (error) {
      // 视图未确认保存时恢复编辑：渲染端仍持有未送达的编辑，冻结不能悬空
      if (this.freezeWaiters.get(session.info.id)?.id === requestId) this.unfreeze(session);
      throw error;
    } finally {
      this.freezeWaiters.delete(session.info.id);
    }
  }

  private removeWindowViews(windowId: number) {
    for (const [id, view] of this.views) if (view.windowId === windowId) this.removeView(id);
  }

  private registerWindow(window: BrowserWindow) {
    window.webContents.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace) this.removeWindowViews(window.id);
    });
    window.webContents.on("render-process-gone", () => this.removeWindowViews(window.id));
    window.on("close", event => {
      const views = [...this.views].filter(([, view]) => view.windowId === window.id);
      const scope = { windowId: window.id, reason: "window-close" as const };
      const durable = hasDurableDocuments(scope);
      if (!views.length && !durable) return;
      event.preventDefault();
      if (this.closingWindows.has(window.id)) return;
      this.closingWindows.add(window.id);
      const timeoutMs = this.quitting ? 2000 : 10000;
      const tasks = views.map(
        ([id, view]) =>
          new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("编辑窗口未完成保存")), timeoutMs);
            this.closeWaiters.set(id, () => {
              clearTimeout(timeout);
              resolve();
            });
            window.webContents.send("collaboration:flush", { documentId: view.documentId });
          })
      );
      let drain: DocumentDrain | undefined;
      tasks.push(
        prepareDurableDocuments(scope).then(value => {
          drain = value;
        })
      );
      void Promise.allSettled(tasks)
        .then(async results => {
          const failure = results.find(result => result.status === "rejected");
          if (failure?.status === "rejected") throw failure.reason;
          for (const id of new Set(views.map(([, view]) => view.documentId))) {
            const session = this.sessions.get(id);
            if (session?.info.mode === "local") await this.project(session);
          }
          drain?.commit();
          if (!window.isDestroyed()) window.destroy();
        })
        .catch(async error => {
          drain?.rollback();
          if (window.isDestroyed()) return;
          if (this.quitting && !durable) {
            this.removeWindowViews(window.id);
            window.destroy();
            return;
          }
          for (const [, view] of views)
            window.webContents.send("collaboration:freeze", {
              documentId: view.documentId,
              frozen: false,
            });
          window.webContents.send("collaboration:save-blocked", {
            message: `部分内容未能确认保存，窗口已保留。${error instanceof Error ? error.message : String(error)}`,
          });
        })
        .finally(() => {
          for (const [id] of views) this.closeWaiters.delete(id);
          this.closingWindows.delete(window.id);
        });
    });
    window.once("closed", () => {
      this.removeWindowViews(window.id);
    });
  }

  private unfreeze(session: RuntimeSession) {
    session.info.frozen = false;
    session.drainingViews = undefined;
    this.broadcast("collaboration:freeze", { documentId: session.info.id, frozen: false });
  }

  private async prepareLeave(session: RuntimeSession) {
    if (session.info.frozen) throw new Error("内容正在切换，请稍后重试");
    try {
      await this.freeze(session);
      if (session.info.pending) throw new Error("仍有未同步改动，请等待同步后再退出");
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
        for (const id of resources.ids)
          await this.assets.localizeReference(
            session.info.serverUrl,
            session.info.id,
            ASSET_PREFIX + id
          );
        this.store.set(`close-revision:${session.info.id}`, protocol.revision);
      } else {
        const references = collectNodeDocumentResources(session.doc);
        for (const reference of references)
          if (reference.startsWith(ASSET_PREFIX))
            await this.assets.localizeReference(session.info.serverUrl, session.info.id, reference);
      }
    } catch (error) {
      this.unfreeze(session);
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
          const room = this.whiteboardRooms.get(`${url}/${event.documentId}`);
          if (session) {
            session.info.members = event.members;
            this.changed(session);
          } else if (room) {
            room.members = event.members;
            this.changed();
          }
        } else {
          const session = this.sessions.get(event.documentId);
          if (session) void this.revoke(session, event.type);
          else if (this.whiteboardRooms.has(`${url}/${event.documentId}`)) void this.refresh();
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
  private async refresh() {
    if (this.refreshing || this.stopped || this.pendingCreates.size > 0) return;
    this.refreshing = true;
    try {
      const urls = new Set([
        this.serverUrl,
        ...[...this.sessions.values()]
          .filter(session => session.info.mode !== "local")
          .map(session => session.info.serverUrl),
      ]);
      const errors: string[] = [];
      for (const url of urls) {
        if (!this.store.get(`identity:${url}`, null)) continue;
        try {
          const { documents } = await this.client.request<{
            documents: SharedDocumentInfo[];
          }>(url, "/v1/documents");
          const available = new Set(documents.map(info => info.id));
          this.remoteDocuments.set(url, available);
          // 单篇失败只跳过该篇，列表、成员与撤权检测照常进行
          const failed: string[] = [];
          for (const info of documents)
            try {
              await this.syncRemoteDocument(url, info);
            } catch (error) {
              console.warn(`[collaboration] 共享文档 ${info.id} 暂时无法加载`, error);
              failed.push(`《${info.title || "未命名"}》`);
            }
          if (failed.length) errors.push(`${failed.join("、")}暂时无法加载，稍后自动重试`);
          for (const key of this.nonContentRooms)
            if (key.startsWith(`${url}/`) && !available.has(key.slice(url.length + 1))) {
              this.nonContentRooms.delete(key);
              this.whiteboardRooms.delete(key);
            }
          for (const session of [...this.sessions.values()]) {
            if (session.info.serverUrl !== url) continue;
            if (session.info.leaving) {
              await this.finishLeave(session);
              continue;
            }
            if (!available.has(session.info.id) && session.info.status === "active")
              await this.revoke(session, "revoked");
          }
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
    } finally {
      this.refreshing = false;
    }
  }
  /** 对齐一篇远端共享：内存会话更新元数据，冷缓存先恢复，缓存缺失或损坏按远端快照重建。 */
  private async syncRemoteDocument(url: string, info: SharedDocumentInfo) {
    const roomKey = `${url}/${info.id}`;
    if (this.nonContentRooms.has(roomKey)) {
      if (this.whiteboardRooms.has(roomKey))
        this.whiteboardRooms.set(roomKey, { ...info, serverUrl: url });
      return;
    }
    const existing = this.findSession(info.id);
    if (existing) {
      Object.assign(existing.info, info);
      existing.info.source ||= this.findLocalSource(info.id, url);
      const protocol = await this.client.request<{
        version: number;
        epoch: number;
        baselineId: string;
      }>(url, `/v1/documents/${info.id}/protocol`);
      if (
        protocol.version === NODE_DOCUMENT_VERSION &&
        protocol.epoch > Number(existing.doc.getMap("meta").get("epoch") ?? 0)
      ) {
        existing.info.remoteVersionAvailable = true;
        if (!existing.info.frozen) await this.freeze(existing);
        existing.provider?.detach();
      }
      this.store.metadata(existing.info);
      return;
    }
    let state: string;
    try {
      ({ state } = await this.client.request<{ state: string }>(
        url,
        `/v1/documents/${info.id}/state`,
        "GET",
        undefined,
        NODE_DOCUMENT_VERSION
      ));
    } catch (failure) {
      if ((failure as { code?: string }).code === "CLIENT_UPGRADE_REQUIRED") {
        const protocol = await this.client.request<{ version: number }>(
          url,
          `/v1/documents/${info.id}/protocol`
        );
        if (protocol.version === WHITEBOARD_DOCUMENT_VERSION) {
          this.nonContentRooms.add(roomKey);
          this.whiteboardRooms.set(roomKey, { ...info, serverUrl: url });
          return;
        }
      }
      throw failure;
    }
    const doc = new Y.Doc();
    try {
      Y.applyUpdate(doc, Buffer.from(state, "base64"));
      await validateNodeDocument(doc, {
        documentId: info.id,
        baselineId: String(doc.getMap("meta").get("baselineId")),
        epoch: Number(doc.getMap("meta").get("epoch")),
      });
    } catch (failure) {
      doc.destroy();
      throw failure;
    }
    const session: CollaborationSession = {
      ...info,
      serverUrl: url,
      source: this.findLocalSource(info.id, url),
      connection: "connecting",
      pending: false,
      leaving: false,
    };
    this.store.create(session, doc);
    this.restore(session, doc);
  }
  private databaseForEvent(
    event: IpcMainInvokeEvent | { db: import("better-sqlite3").Database; name: string }
  ) {
    if (!("sender" in event)) {
      if (!event.db.open || databaseModule.getDatabase(event.name) !== event.db)
        throw new Error("资料库连接已变化，请重新打开正文");
      return event;
    }
    const window = BrowserWindow.fromWebContents(event.sender);
    const name = window && databaseModule.windowToDatabase.get(window.id);
    const db = name ? databaseModule.getDatabase(name) : undefined;
    if (!name || !db?.open) throw new Error("当前内容数据库尚未连接");
    return { db, name };
  }
  private findLocalSource(documentId: string, serverUrl: string) {
    for (const [name, db] of databaseModule.databases) {
      if (!db.open) continue;
      const source = restoreContentBinding(db, name, documentId, serverUrl);
      if (source) return source;
    }
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
        let snapshot = await this.openContent(event, {
          contentId,
          sourceType,
          sourceId,
          sourceTitle,
        });
        let local = this.requireSession(snapshot.documentId);
        // 命中结束共享的残留会话：先写回本地并拆除（同「清理本地记录」），再重走创建，
        // 否则会按「恢复共享」对已删的服务器文档重新签码
        const reshare = snapshot.mode !== "local" ? planClosedReshare(local.info) : null;
        if (reshare) {
          if (reshare.action === "reject") throw new Error(reshare.reason);
          await this.discardLocal(local);
          snapshot = await this.openContent(event, {
            contentId,
            sourceType,
            sourceId,
            sourceTitle,
          });
          local = this.requireSession(snapshot.documentId);
        }
        if (snapshot.mode !== "local") {
          const invitation = await this.issueInvitation(local.info.serverUrl, local.info.id);
          return { documentId: local.info.id, code: invitation.code };
        }
        try {
          if (!local.info.frozen) await this.freeze(local);
          else if (!this.store.get(`publishing:${local.info.id}`, null))
            throw new Error("正文已暂停编辑，请等待当前保存或共享操作完成");
          if (sourceType !== "card" && sourceTitle !== undefined)
            replaceText(local.doc.getText("title"), sourceTitle.slice(0, 500));
          await this.project(local);
          const result = await this.publishSession(event, local, {
            contentId,
            sourceType,
            sourceId,
            sourceTitle: local.doc.getText("title").toString(),
          });
          this.unfreeze(local);
          return result;
        } catch (failure) {
          // 共享尚未提交时解除输入冻结
          if (
            this.sessions.has(local.info.id) &&
            !this.store.get(`publishing:${local.info.id}`, null)
          )
            this.unfreeze(local);
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
    const key = `publishing:${previousId}`;
    let prepared = this.store.get<{
      documentId: string;
      baselineId: string;
      state: string;
      revision: string;
      serverUrl: string;
    } | null>(key, null);
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
        this.store.set(key, prepared);
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
      for (const [viewId, view] of this.views)
        if (view.documentId === previousId) this.removeView(viewId);
      unregisterContentSession(session);
      session.awareness.destroy();
      session.doc.destroy();
      this.sessions.delete(previousId);
      this.store.remove(previousId);
      this.contentState?.db
        .prepare("DELETE FROM entity_holds WHERE holder=?")
        .run(`document:${previousId}`);
      this.store.delete(key);
      this.broadcast("collaboration:removed", { documentId: previousId });
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
      const nextId = localSessionId(db.name, source.contentId, source.contentCreatedAt);
      if (this.sessions.has(nextId)) throw new Error("本机正文仍在编辑，请稍后重试");
      // 共享期间的本机冷缓存早于共享内容，备份后让位给结束共享的最终正文
      this.store.discard(nextId, "结束共享时发现旧本机缓存");
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
        contracts
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
              expectedRevision: stored.revision,
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
        this.store.create(info, doc);
        this.restore(info, doc);
        this.store.set(
          `generation:${source.databaseName}:${source.contentId}`,
          this.store.get(`generation:${source.databaseName}:${source.contentId}`, 0) + 1
        );
        await this.removeSession(session);
        return;
      } catch (failure) {
        if (this.sessions.get(nextId)?.doc !== doc) doc.destroy();
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

  private async replaceContentSnapshot(
    session: RuntimeSession,
    content: ContentNode[],
    supplied: ContentContractDictionary | undefined,
    expectedRevision: string | undefined
  ): Promise<void> {
    const check = () => {
      if (
        session.info.frozen ||
        session.info.leaving ||
        session.info.status !== "active" ||
        this.sessions.get(session.info.id) !== session
      )
        throw new Error("正文会话已变化，请重新读取");
      if (!expectedRevision || contentRevision(session) !== expectedRevision)
        throw new Error("CONTENT_VERSION_CONFLICT: 正文已变化，请保留待应用结果后重试");
    };
    check();
    const candidate = new Y.Doc({ gc: false });
    Y.applyUpdate(candidate, Y.encodeStateAsUpdate(session.doc));
    const vector = Y.encodeStateVector(candidate),
      tree = new NodeTree(candidate);
    try {
      await tree.installContracts(supplied ?? {}, null);
      const contracts = tree.contracts.toJSON() as ContentContractDictionary;
      const value = { ...readNodeDocument(candidate), content };
      const mapped =
        session.info.mode === "local"
          ? await this.assets.prepareLocalDocument(session.info.id, value, contracts)
          : await this.assets.shareDocument(
              session.info.serverUrl,
              session.info.id,
              session.info.id,
              value,
              contracts
            );
      check();
      applyNodeTreeContent(tree, mapped.content, {});
      const meta = session.doc.getMap("meta"),
        identity = {
          documentId: session.info.id,
          baselineId: String(meta.get("baselineId")),
          epoch: Number(meta.get("epoch")),
        };
      await validateNodeDocument(candidate, identity, session.doc);
      check();
      const update = Y.encodeStateAsUpdate(candidate, vector),
        operationId = randomUUID();
      this.contentState!.saveDocumentDraft(
        { workspaceId: session.info.source?.databaseName ?? "application", ...identity },
        `operation:${operationId}`,
        { state: Y.encodeStateAsUpdate(candidate), sequence: 1 }
      );
      this.retainNodeState(session, candidate);
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
            expiresAt: Date.now() + 4 * 60_000,
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
      await new NodeSessionUpdates(this.store, this.contentState).apply(session, update, () => {
        if (
          this.sessions.get(session.info.id) !== session ||
          session.doc.getMap("meta").get("baselineId") !== identity.baselineId
        )
          throw new Error("正文会话已变化，待应用结果已保留");
        if (session.info.mode === "local") check();
      });
      await this.project(session);
    } finally {
      tree.dispose();
      candidate.destroy();
    }
  }

  private async project(session: RuntimeSession) {
    if (session.doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION) return;
    if (!session.info.source || this.projecting.has(session.info.id)) return;
    const database = databaseModule.getDatabase(session.info.source.databaseName);
    if (!database?.open) return;
    this.projecting.add(session.info.id);
    try {
      const source = session.info.source;
      if (!source) return;
      const local = session.info.mode === "local";
      if (local && findCollaborationBinding(database, source.contentId)) return;
      session.projectionDirty = false;
      const stored = ContentDocumentTable.read(database, source.contentId);
      if (!stored) throw new Error("CONTENT_FORMAT_UNSUPPORTED: 正文格式不受支持");
      const contracts = session.doc
        .getMap("node-tree:contracts")
        .toJSON() as ContentContractDictionary;
      const value = await this.assets.localizeDocument(
        session.info.serverUrl,
        session.info.id,
        readNodeDocument(session.doc),
        contracts
      );
      if (
        databaseModule.getDatabase(source.databaseName) !== database ||
        !database.open ||
        !this.sessions.has(session.info.id)
      )
        return;
      const count = getContentLength(value.content as import("slate").Descendant[]);
      const changed = projectContractContent(
        database,
        source,
        session,
        { documentId: stored.documentId, contracts, content: value.content },
        source.projectionRevision,
        count
      );
      source.projectionRevision = ContentDocumentTable.read(database, source.contentId)!.revision;
      this.store.metadata(session.info);
      for (const entry of projectContentTitle(database, source.contentId, value.title))
        this.broadcast(entry.channel, {
          databaseName: basename(database.name),
          [entry.field]: entry.id,
        });
      if (changed) {
        this.broadcast("content:updated", {
          databaseName: basename(database.name),
          contentId: source.contentId,
        });
        emitContentWritten(database, source.contentId, "update");
      }
      session.info.title = value.title;
      if (local && session.info.error) {
        session.info.error = undefined;
        this.changed(session);
      }
    } catch (error) {
      session.projectionDirty = true;
      throw error;
    } finally {
      this.projecting.delete(session.info.id);
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
  private async removeSession(session: RuntimeSession) {
    if (
      !session.info.frozen &&
      [...this.views.values()].some(view => view.documentId === session.info.id)
    )
      await this.freeze(session);
    for (const [id, view] of this.views)
      if (view.documentId === session.info.id) this.removeView(id);
    unregisterContentSession(session);
    session.provider?.destroy();
    session.awareness.destroy();
    session.doc.destroy();
    this.sessions.delete(session.info.id);
    this.store.remove(session.info.id);
    this.contentState?.db
      .prepare("DELETE FROM entity_holds WHERE holder=?")
      .run(`document:${session.info.id}`);
    rmSync(join(this.directory, "assets", session.info.id), {
      recursive: true,
      force: true,
    });
    this.broadcast("collaboration:removed", { documentId: session.info.id });
    this.changed();
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
    try {
      if (session.info.role === "owner") {
        await this.client.request(
          session.info.serverUrl,
          `/v1/documents/${session.info.id}/close`,
          "POST",
          {
            expectedRevision: this.store.get<string | undefined>(
              `close-revision:${session.info.id}`,
              undefined
            ),
          }
        );
        // 作者结束共享：本机还有这篇内容，会话降级回本机继续编辑（同一个 Y.Doc）；
        // 没有本地内容（源已删除等）才拆除会话
        if (session.info.source) {
          session.info.leaving = false;
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
      if ((error as { code?: string }).code === "REVISION_CONFLICT") {
        session.info.leaving = false;
        this.store.delete(`close-revision:${closingId}`);
        this.unfreeze(session);
        session.provider?.attach();
      }
      session.info.error = error instanceof Error ? error.message : "正在等待退出完成";
      this.changed(session);
    } finally {
      this.finishingLeaves.delete(closingId);
    }
  }

  documentStorage() {
    if (!this.contentState) throw new Error("文档存储服务未就绪");
    return {
      state: this.contentState,
      store: this.store,
    };
  }
  documentAssets(): CollaborationAssetService {
    if (!this.assets) throw new Error("资源服务未就绪");
    return this.assets;
  }
  documentClient(): CollaborationClient {
    if (!this.client) throw new Error("文档传输服务未就绪");
    return this.client;
  }

  private async drainDatabase(scope: DocumentDrainScope): Promise<DocumentDrain> {
    if (scope.reason !== "database-change" && scope.reason !== "quit")
      return { commit() {}, rollback() {} };
    const affected = [...this.sessions.values()].filter(
      session =>
        (scope.reason === "quit" || session.info.source) &&
        (!scope.databaseName || session.info.source?.databaseName === scope.databaseName) &&
        (scope.windowId === undefined ||
          [...this.views.values()].some(
            view => view.documentId === session.info.id && view.windowId === scope.windowId
          ))
    );
    const resumed: RuntimeSession[] = [];
    const resume = () => {
      for (const session of resumed) {
        this.unfreeze(session);
        session.provider?.attach();
        this.attach(session);
        this.changed(session);
      }
    };
    try {
      for (const session of affected) {
        if (!session.info.frozen) {
          resumed.push(session);
          await this.freeze(session);
        } else if (session.drainingViews?.size) throw new Error("正文仍有未确认输入，不能退出");
        session.provider?.detach();
        if (session.dirty) {
          this.store.compact(session.info.id, session.doc);
          session.dirty = false;
        }
        const source = session.info.source;
        const database = source && databaseModule.getDatabase(source.databaseName);
        if (source && database?.open) {
          const row = database
            .prepare("SELECT create_time FROM contents WHERE id=?")
            .get(source.contentId) as { create_time: number } | undefined;
          const stored = ContentDocumentTable.read(database, source.contentId);
          const matches =
            row?.create_time === source.contentCreatedAt &&
            (!source.librarySourceId ||
              source.librarySourceId === ContentIdentityTable.library(database)?.sourceId) &&
            (!source.contentDocumentId || source.contentDocumentId === stored?.documentId);
          if (!matches) {
            // 主库来源变化不能用旧缓存补写；先确认缓存已耐久保存。
            this.store.metadata(session.info);
            const cached = this.store.load(session.info.id);
            try {
              if (contentRevision({ ...session, doc: cached.doc }) !== contentRevision(session))
                throw new Error("正文缓存尚未完整保存，不能关闭资料库");
            } finally {
              cached.doc.destroy();
            }
            console.warn(
              "[collaboration:drain-source-mismatch] 已保存缓存，跳过不同来源的主库投影",
              {
                databaseName: source.databaseName,
                documentId: session.info.id,
                contentId: source.contentId,
              }
            );
            continue;
          }
        }
        await this.project(session);
      }
      return {
        commit: () => {
          if (scope.reason === "quit") return;
          resume();
          for (const session of affected) unregisterContentSession(session);
        },
        rollback: resume,
      };
    } catch (failure) {
      resume();
      throw failure;
    }
  }

  private readonly replacementReleases = new Map<string, Promise<void>>();

  /** 本地会话备份后丢弃，共享会话解除来源；同一会话并发释放只执行一次。 */
  private releaseReplacedSession(
    session: RuntimeSession,
    reason = "资料库或正文身份已变化"
  ): Promise<void> {
    const id = session.info.id;
    const pending = this.replacementReleases.get(id);
    if (pending) return pending;
    const release = (async () => {
      for (const [viewId, view] of this.views) if (view.documentId === id) this.removeView(viewId);
      unregisterContentSession(session);
      if (session.info.mode === "local") {
        // 缓存里可能有尚未投影的编辑，删除前留一份可恢复的原始字节
        if (session.dirty) this.store.compact(id, session.doc);
        this.store.discard(id, reason);
        session.provider?.destroy();
        session.awareness.destroy();
        session.doc.destroy();
        this.sessions.delete(id);
        this.contentState?.db
          .prepare("DELETE FROM entity_holds WHERE holder=?")
          .run(`document:${id}`);
        rmSync(join(this.directory, "assets", id), { recursive: true, force: true });
      } else {
        session.info.source = undefined;
        this.retainNodeState(session, session.doc);
        this.changed(session);
      }
      this.broadcast("collaboration:removed", { documentId: id, replaced: true });
    })().finally(() => this.replacementReleases.delete(id));
    this.replacementReleases.set(id, release);
    return release;
  }

  /**
   * 整库被同步下载替换：本库正文缓存对应的是旧库。内存会话与磁盘冷缓存一并释放——
   * 冷缓存从未参与关库写回，留着会在下次打开时拿旧库内容覆盖新库。
   * 调用前 close-database 已把内存会话写回旧库，旧库也已复制进 backup/。
   */
  async releaseLibrary(name: string): Promise<void> {
    const candidates = new Map(this.store.list().map(info => [info.id, info]));
    for (const session of this.sessions.values()) candidates.set(session.info.id, session.info);
    for (const info of candidates.values()) {
      if (info.source?.databaseName !== name) continue;
      const session = this.findSession(info.id);
      if (session) await this.releaseReplacedSession(session);
    }
    this.changed();
  }

  async init() {
    this.directory = join(PathUtil.getAppDir(), "collaboration");
    this.store = new CollaborationLocalStore(this.directory);
    this.contentState = new ContentLocalState(this.store.db);
    const retention = new ContentRetention(this.contentState);
    this.stopContentRetention = registerDurableEntityHolds((db, kind, id) => {
      const workspaceId = [...databaseModule.databases].find(([, value]) => value === db)?.[0];
      return (
        workspaceId === undefined ||
        [...this.sessions.values()].some(
          session =>
            session.info.source?.databaseName === workspaceId &&
            (session.projectionDirty || Boolean(session.info.error))
        ) ||
        retention.has(db, workspaceId, kind, id)
      );
    }, "content");
    if (!this.store.get("localDeviceId", "")) this.store.set("localDeviceId", randomUUID());
    this.client = new CollaborationClient(this.store);
    this.assets = new CollaborationAssetService(this.store, PathUtil.getAppDir(), url =>
      this.client.identity(url)
    );
    this.stopDocumentDrain = registerDurableDocuments({
      has: scope =>
        scope.reason === "database-change" || (scope.reason === "quit" && this.sessions.size > 0),
      prepare: scope => this.drainDatabase(scope),
    });
    // 打不开的缓存由 loadCached 备份后丢弃，共享会话随后按远端快照重建，本机正文按主库重建
    for (const info of this.store.list())
      if (info.mode !== "local" || !info.source?.contentDocumentId) this.loadCached(info.id, info);
    registerCollaborationIpc({
      store: this.store,
      contentState: this.contentState,
      client: this.client,
      assets: this.assets,
      serverUrl: () => this.serverUrl,
      sessions: this.sessions,
      findSession: this.findSession.bind(this),
      views: this.views,
      state: this.state.bind(this),
      changed: this.changed.bind(this),
      refresh: this.refresh.bind(this),
      databaseForEvent: this.databaseForEvent.bind(this),
      requireSession: this.requireSession.bind(this),
      whiteboardRoom: this.whiteboardRoom.bind(this),
      openContent: this.openContent.bind(this),
      acknowledgeFreeze: this.acknowledgeFreeze.bind(this),
      prepareLeave: this.prepareLeave.bind(this),
      createContent: this.createContent.bind(this),
      issueInvitation: this.issueInvitation.bind(this),
      removeView: this.removeView.bind(this),
      clearBinding: this.clearBinding.bind(this),
      discardLocal: this.discardLocal.bind(this),
      removeSession: this.removeSession.bind(this),
      finishLeave: this.finishLeave.bind(this),
      flushResources: this.flushResources.bind(this),
    });
    for (const window of BrowserWindow.getAllWindows()) this.registerWindow(window);
    app.on("browser-window-created", (_event, window) => this.registerWindow(window));
    this.autoFlushInterval = setInterval(() => {
      for (const session of this.sessions.values()) {
        try {
          if (session.dirty) {
            this.store.compact(session.info.id, session.doc);
            session.dirty = false;
          }
          if (session.projectionDirty && !session.info.leaving && session.info.status === "active")
            void this.project(session).catch(error => {
              session.info.error = error instanceof Error ? error.message : "本地保存失败";
              this.changed(session);
            });
        } catch (error) {
          session.info.error = error instanceof Error ? error.message : "本地保存失败";
          this.changed(session);
        }
      }
      void this.flushResources();
    }, 1000);
    this.autoFlushInterval.unref();
    this.refreshInterval = setInterval(() => void this.refresh(), 15000);
    this.refreshInterval.unref();
    void this.refresh();
  }

  /** 受控退出收尾：停止后台任务并断开所有协作连接 */
  shutdown(): void {
    this.quitting = true;
    this.stopped = true;
    if (this.autoFlushInterval) clearInterval(this.autoFlushInterval);
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    for (const socket of this.events.values()) socket.close();
    for (const transport of this.transports.values()) transport.disconnect();
    this.stopContentRetention?.();
    this.stopContentRetention = undefined;
    this.stopDocumentDrain?.();
    this.stopDocumentDrain = undefined;
    this.contentState = undefined;
  }
  private removeView(viewId: string) {
    const view = this.views.get(viewId);
    if (!view) return;
    this.acknowledgeFreeze(viewId, this.freezeWaiters.get(view.documentId)?.id);
    const awareness = this.sessions.get(view.documentId)?.awareness;
    if (awareness) removeAwarenessStates(awareness, view.clientIds, "view-closed");
    this.views.delete(viewId);
    const session = this.sessions.get(view.documentId);
    if (session?.info.mode === "local")
      setTimeout(() => {
        if (
          !this.sessions.has(session.info.id) ||
          session.info.frozen ||
          [...this.views.values()].some(entry => entry.documentId === session.info.id)
        )
          return;
        void this.project(session)
          .then(() => {
            if (
              !session.projectionDirty &&
              session.info.source &&
              databaseModule.getDatabase(session.info.source.databaseName)?.open &&
              ![...this.views.values()].some(entry => entry.documentId === session.info.id)
            )
              return this.removeSession(session);
          })
          .catch(error => {
            session.info.error = String(error);
            this.changed(session);
          });
      }, 250).unref();
  }
}

export default new CollaborationManager();
