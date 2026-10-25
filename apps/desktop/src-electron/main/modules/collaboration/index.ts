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
import { rmSync, mkdtempSync, existsSync } from "node:fs";
import Database from "better-sqlite3";
import { basename, join } from "node:path";
import {
  DEFAULT_COLLABORATION_URL,
  SOURCE_TYPES,
  createLegacySnapshot,
  collectSharedResources,
  replaceText,
  validateDocument,
  NODE_DOCUMENT_VERSION,
  WHITEBOARD_DOCUMENT_VERSION,
  readNodeDocument,
  createNodeDocument,
  validateNodeDocument,
  NodeTree,
  collectNodeDocumentResources,
  collectWhiteboardDocumentResources,
  ASSET_PREFIX,
  type ContentSessionTarget,
  type ContentSessionSnapshot,
  type CollaborationEvent,
  type CollaborationSession,
  type CollaborationState,
  type ContentNode,
  type DocumentMigration,
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
import { ContentIdentityTable } from "../tables/content-identity";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import {
  CONTENT_ENTITY_NODE_CONTRACTS,
  isContentEntityReference,
  type ContentEntityReference,
} from "@tau/db-schema/content-identities";
import { setExtraTableRefsProvider } from "../extra-table-refs";
import { bindingMatches, planClosedReshare, restoreContentBinding } from "./content-repository";
import { CollaborationAssetService } from "./asset-service";
import { CollaborationClient } from "./client";
import { registerCollaborationIpc } from "./ipc-controller";
import type { RuntimeSession, CollaborationView } from "./types";
import { getContentLength } from "@/utils/helper";
import { CollaborationLocalStore } from "./local-store";
import { ContentLocalState } from "./content-local-state";
import { ContentRecoveryStore, fileDigest } from "./content-recovery";
import { ContentMigration } from "./content-migration";
import { ContentRetention } from "./content-retention";
import { contentRecoveryResources } from "./content-recovery-resources";
import { registerDurableEntityHolds } from "../durable-entity-holds";
import { getDevelopmentServerUrl } from "./dev-server";
import { findCollaborationBinding } from "../collaboration-guard";
import { emitContentWritten } from "../content-events";
import { diaryLinkPatcher } from "../diary-entity-upgrade";
import { localSessionId } from "./session-identity";
import {
  findContentTitle,
  projectContentTitle,
  projectContractContent,
  patchSessionNodes,
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
  // 会话完成知识库引用转换后不再重复整树比对；会话对象重建时自然重查（迁移幂等）
  private directory = "";
  private sessions = new Map<string, RuntimeSession>();
  // 旧 documentId → 新 documentId（升级 / 降级换身份后的过渡期，见 rekeySession）
  private transports = new Map<string, HocuspocusProviderWebsocket>();
  private events = new Map<string, WebSocket>();
  private views = new Map<string, CollaborationView>();
  private requests: JoinRequest[] = [];
  private refreshing = false;
  private readonly nonContentRooms = new Set<string>();
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

  /** 数据表回收对账（D-136）：私有块树里 database 节点按 tableId 计数，含嵌套子节点 */
  private collectPrivateTableRefs(databaseName: string): Map<number, number> {
    const counts = new Map<number, number>();
    const walk = (node: ContentNode) => {
      if (node.type === "database" && typeof node.tableId === "number")
        counts.set(node.tableId, (counts.get(node.tableId) ?? 0) + 1);
      node.children?.forEach(walk);
    };
    // 共享正文里数据库块的真实节点只存在 private_nodes；会话按 source.databaseName
    // 归属主库（与 databaseModule 的库名同口径），内存会话恒为最新（初始化时已全量恢复）
    for (const session of this.sessions.values()) {
      if (session.info.source?.databaseName !== databaseName) continue;
      for (const node of this.store.legacyPrivateNodes(session.info.id).values()) walk(node);
    }
    return counts;
  }

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
        url: `${this.client.canonicalUrl(url).replace(/^http/, "ws")}/ws`,
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
    if (info.source && !Number.isSafeInteger(info.source.contentCreatedAt))
      info.source = this.findLocalSource(info.id, info.serverUrl);
    const session: RuntimeSession = {
      info: {
        ...info,
        frozen: Boolean(
          info.remoteVersionAvailable ||
          this.contentState
            ?.pendingMigrations()
            .some(record => record.plan.documentId === info.id) ||
          this.store.get(`publishing:${info.id}`, null) ||
          this.store.get(`library-detached:${info.id}`, null) ||
          this.contentState?.preparation(info.id)
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
    // 广播与落盘一律读 session.info.id：会话升级 / 降级会换 documentId（见 rekeySession），
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
    if (doc.getMap("meta").get("version") === 1)
      this.legacyContentListener?.(source?.databaseName ?? databaseModule.getCurrentDatabaseName());
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
    let session = this.sessions.get(id);
    if (!session && this.store?.db.prepare("SELECT 1 FROM sessions WHERE id=?").get(id)) {
      const cached = this.store.load(id);
      session = this.restore(cached.info, cached.doc);
    }
    return session;
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
    if (session) {
      const detached = this.store.get<{
        sourceId: string | null;
        documentId: string | null;
        revision: string;
        frozen: boolean;
      } | null>(`library-detached:${id}`, null);
      if (detached) {
        const stored = ContentDocumentTable.read(db, content.id);
        const revision =
          stored?.revision ??
          createHash("sha256").update(JSON.stringify(content.content)).digest("hex");
        if (
          detached.sourceId !== (ContentIdentityTable.library(db)?.sourceId ?? null) ||
          detached.documentId !== (stored?.documentId ?? null) ||
          detached.revision !== revision
        )
          throw new Error("资料库快照已替换，原编辑会话已保存在恢复包；请先处理本机恢复副本");
        this.store.delete(`library-detached:${id}`);
        if (!detached.frozen) this.unfreeze(session);
        registerContentSession(db, content.id, session);
        session.provider?.attach();
        this.attach(session);
        this.changed(session);
      }
    }
    if (binding && !session) throw new Error("协作会话尚未恢复，请稍后重试");
    if (!session) {
      if (this.store.db.prepare("SELECT 1 FROM sessions WHERE id=?").get(id))
        throw new Error("该正文仍有未恢复的协作缓存，请先恢复原数据");
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
      const doc = stored
        ? await createNodeDocument(
            { documentId: id, baselineId: randomUUID(), epoch: 0 },
            await this.assets.prepareLocalDocument(id, value, stored.contracts),
            stored.contracts
          )
        : createLegacySnapshot({
            title,
            content: content.content as ContentNode[],
            bannerBg: "",
            bannerPosition: "center",
          });
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
    // 缓存的会话正文也需同步日记引用身份，避免旧快照覆盖开库转换后的正文。
    if (
      session.doc.getMap("meta").get("version") === NODE_DOCUMENT_VERSION &&
      session.info.status === "active" &&
      !session.info.frozen &&
      !session.info.leaving
    )
      patchSessionNodes(session, diaryLinkPatcher(db));
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
          String(meta.get("baselineId") ?? `legacy:${session.info.id}`) !== protocol.baselineId
        )
          throw new Error("房间基线已变化，须先恢复本机副本");
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
        await this.preserveSession(session);
        this.store.set(`close-revision:${session.info.id}`, protocol.revision);
      } else {
        const references =
          session.doc.getMap("meta").get("version") === NODE_DOCUMENT_VERSION
            ? collectNodeDocumentResources(session.doc)
            : collectSharedResources(session.doc);
        for (const reference of references)
          if (reference.startsWith(ASSET_PREFIX))
            await this.assets.localizeReference(session.info.serverUrl, session.info.id, reference);
        await this.preserveSession(session);
      }
    } catch (error) {
      this.unfreeze(session);
      throw error;
    }
  }

  private async preserveSession(session: RuntimeSession) {
    if (!this.contentState) throw new Error("恢复服务尚未就绪");
    const privateNodes = this.store.legacyPrivateNodes(session.info.id);
    const revision = createHash("sha256")
      .update(contentRevision(session))
      .update(JSON.stringify([...privateNodes]))
      .update(
        JSON.stringify(
          this.store.db
            .prepare("SELECT * FROM resources WHERE document_id=? ORDER BY id")
            .all(session.info.id)
        )
      )
      .update(
        JSON.stringify(
          this.contentState.db
            .prepare(
              "SELECT digest,sequence FROM document_drafts WHERE document_id=? AND applied=0 ORDER BY view_id"
            )
            .all(session.info.id)
        )
      )
      .update(
        JSON.stringify(
          this.contentState.db
            .prepare(
              "SELECT view_id,node_id,field,value,revision,sequence FROM input_drafts WHERE document_id=? AND applied=0 ORDER BY view_id,node_id,field"
            )
            .all(session.info.id)
        )
      )
      .update(
        JSON.stringify(
          this.contentState.db
            .prepare(
              "SELECT workspace_id,node_id,owner,value FROM node_views WHERE document_id=? ORDER BY workspace_id,node_id,owner"
            )
            .all(session.info.source?.contentDocumentId ?? session.info.id)
        )
      )
      .digest("hex");
    const previous = this.store.get<{ revision: string; recoveryId: string } | null>(
      `recovery:${session.info.id}`,
      null
    );
    const recovery = new ContentRecoveryStore(this.directory, this.contentState);
    const workspaceId =
      session.info.source?.databaseName ??
      [...this.views.values()].find(view => view.documentId === session.info.id)?.inputIdentity
        .workspaceId ??
      "application";
    const source = session.info.source;
    const db = source ? databaseModule.getDatabase(workspaceId) : undefined;
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value));
    const files: ({ name: string; path: string } | { name: string; bytes: Uint8Array })[] = [];
    if (source) {
      if (!db?.open) throw new Error("请打开原资料库以保全引用实体");
      const row = db
        .prepare("SELECT content,create_time FROM contents WHERE id=?")
        .get(source.contentId) as { content: string; create_time: number } | undefined;
      const document = ContentDocumentTable.read(db, source.contentId);
      if (
        !row ||
        row.create_time !== source.contentCreatedAt ||
        (source.librarySourceId &&
          ContentIdentityTable.library(db)?.sourceId !== source.librarySourceId) ||
        (source.contentDocumentId && document?.documentId !== source.contentDocumentId)
      )
        throw new Error("原正文来源已变化，停止保全与替换");
      files.push({
        name: "source-projection.json",
        bytes: encode({
          source,
          content: JSON.parse(row.content),
          contracts: document?.contracts ?? null,
        }),
      });
    }
    const dependencies =
      db && source
        ? new ContentRetention(this.contentState).dependencies(
            db,
            workspaceId,
            [{ kind: "content", id: source.contentId }],
            session.info.id
          )
        : [];
    const references =
      session.doc.getMap("meta").get("version") === NODE_DOCUMENT_VERSION
        ? collectNodeDocumentResources(session.doc)
        : collectSharedResources(session.doc);
    const resources = this.assets.recoveryFiles(session.info.id, [
      ...references,
      ...(db ? contentRecoveryResources(db, dependencies) : []),
    ]);
    files.push(
      { name: "document.bin", bytes: Y.encodeStateAsUpdate(session.doc) },
      { name: "session.json", bytes: encode(session.info) },
      { name: "private.json", bytes: encode([...privateNodes]) },
      { name: "resources.json", bytes: encode(resources.resources) },
      ...resources.files
    );
    for (const [index, draft] of this.contentState
      .documentDrafts(workspaceId)
      .filter(draft => draft.documentId === session.info.id)
      .entries()) {
      const { state, ...metadata } = draft;
      files.push(
        { name: `view-${index}.bin`, bytes: state },
        { name: `view-${index}.json`, bytes: encode(metadata) }
      );
    }
    files.push(
      {
        name: "input-drafts.json",
        bytes: encode(
          this.contentState
            .inputDrafts(workspaceId)
            .filter(draft => draft.documentId === session.info.id)
        ),
      },
      {
        name: "node-views.json",
        bytes: encode(
          this.contentState.db
            .prepare("SELECT * FROM node_views WHERE workspace_id=? AND document_id=?")
            .all(workspaceId, source?.contentDocumentId ?? session.info.id)
        ),
      }
    );
    const materialRevision = createHash("sha256")
      .update(revision)
      .update(JSON.stringify(files.filter(file => file.name === "source-projection.json")))
      .update(
        JSON.stringify(resources.files.map(file => ({ name: file.name, ...fileDigest(file.path) })))
      )
      .update(JSON.stringify(resources.missing))
      .digest("hex");
    if (previous?.revision === materialRevision) {
      const receipt = this.contentState.recovery(previous.recoveryId);
      if (receipt) {
        recovery.verify(receipt);
        return receipt;
      }
    }
    const receipt = recovery.save({
      workspaceId,
      reason: "offline-edit",
      provenance: {
        documentId: session.info.id,
        source: source ?? null,
        unresolvedLegacySource: !source && privateNodes.size > 0,
      },
      files,
      missing: [
        ...resources.missing,
        ...(!source && privateNodes.size ? ["旧私有实体的资料库来源尚未核对"] : []),
      ],
    });
    this.contentState.db
      .prepare(
        "INSERT OR IGNORE INTO entity_holds SELECT workspace_id,?,'recovery',source_id,entity_kind,entity_id FROM entity_holds WHERE holder=?"
      )
      .run(`recovery:${receipt.id}`, `document:${session.info.id}`);
    this.store.set(`recovery:${session.info.id}`, {
      revision: materialRevision,
      recoveryId: receipt.id,
    });
    return receipt;
  }

  private async prepareContentUpgrade(
    event: IpcMainInvokeEvent | { db: import("better-sqlite3").Database; name: string },
    id: string,
    contracts: ContentContractDictionary,
    versionUpgrade?: import("@tau/collaboration").ContentVersionUpgrade
  ) {
    const session = this.requireSession(id);
    const { db, name } = this.databaseForEvent(event);
    if (!this.contentState || (session.info.source && session.info.source.databaseName !== name))
      throw new Error("请在原资料库打开文档后转换");
    if (
      session.info.mode !== "local" &&
      session.info.status === "active" &&
      session.info.role !== "owner"
    )
      throw new Error("只有所有者可以转换共享正文");
    const recovery = new ContentRecoveryStore(this.directory, this.contentState);
    const previous = this.contentState
      .pendingMigrations(session.info.id)
      .find(record => record.plan.documentId === session.info.id);
    if (previous) {
      if (previous.plan.kind === "whiteboard") throw new Error("白板迁移须经白板文档入口处理");
      const plan = JSON.parse(
        recovery.readFile(previous.plan.recovery, "installation.json").toString()
      ) as { issues: { nodeId: string; reason: string }[] };
      return {
        operationId: previous.plan.operationId,
        recoveryId: previous.plan.recovery.id,
        issues: plan.issues,
      };
    }
    if (!session.info.frozen) await this.freeze(session);
    try {
      await this.project(session);
      const migration = new ContentMigration(
        this.contentState,
        this.store,
        this.assets,
        recovery,
        current => databaseModule.getDatabase(name) === current && current.open
      );
      let prepared;
      if (session.info.mode === "local" || session.info.status === "closed")
        prepared = await migration.prepare(db, session, contracts, undefined, versionUpgrade);
      else {
        session.provider?.detach();
        let request = this.contentState.preparation(session.info.id);
        if (!request) {
          const protocol = await this.client.request<{ epoch: number }>(
            session.info.serverUrl,
            `/v1/documents/${session.info.id}/protocol`
          );
          request = this.contentState.prepareRemote({
            workspaceId: name,
            documentId: session.info.id,
            operationId: randomUUID(),
            expectedEpoch: protocol.epoch,
            expiresAt: Date.now() + 4 * 60_000,
          });
        }
        const route = `/v1/documents/${session.info.id}/migrations/${request.operationId}`;
        await this.client.request(session.info.serverUrl, `${route}/prepare`, "POST", request);
        const { operation } = await this.client.request<{ operation: DocumentMigration }>(
          session.info.serverUrl,
          `${route}/freeze`,
          "POST",
          {}
        );
        if (operation.state !== "PENDING") {
          if (operation.state === "COMMITTED") throw new Error("服务端已提交，须恢复原迁移计划");
          this.contentState.finishPreparation(operation);
          this.unfreeze(session);
          session.provider?.attach();
          this.attach(session);
          throw new Error(
            operation.state === "EXPIRED" ? "本次转换已过期，请重新准备" : "本次转换已取消"
          );
        }
        const { state } = await this.client.request<{ state: string }>(
          session.info.serverUrl,
          `/v1/documents/${session.info.id}/state`,
          "GET",
          undefined,
          NODE_DOCUMENT_VERSION
        );
        const confirmed = new Y.Doc({ gc: false });
        try {
          Y.applyUpdate(confirmed, Buffer.from(state, "base64"));
          if (confirmed.getMap("meta").get("version") === NODE_DOCUMENT_VERSION)
            await validateNodeDocument(confirmed, {
              documentId: session.info.id,
              baselineId: String(confirmed.getMap("meta").get("baselineId")),
              epoch: Number(confirmed.getMap("meta").get("epoch")),
            });
          else validateDocument(confirmed);
          prepared = await migration.prepare(
            session.info.source ? db : undefined,
            session,
            contracts,
            { operation, document: confirmed, workspaceId: name },
            versionUpgrade
          );
          this.contentState.observeRemote(prepared.plan.operationId, operation);
        } finally {
          confirmed.destroy();
        }
      }
      this.changed(session);
      const manifest = recovery.verify(prepared.plan.recovery);
      return {
        operationId: prepared.plan.operationId,
        recoveryId: prepared.plan.recovery.id,
        issues: manifest.provenance.issues as { nodeId: string; reason: string }[],
      };
    } catch (failure) {
      if (session.info.mode === "local" || session.info.status === "closed") this.unfreeze(session);
      this.changed(session);
      const pending = this.contentState.preparation(session.info.id);
      if (pending)
        return {
          operationId: pending.operationId,
          issues: [],
          error: failure instanceof Error ? failure.message : "转换准备失败，原始数据已保留",
        };
      throw failure;
    }
  }

  private async finishContentUpgrade(
    event: IpcMainInvokeEvent | { db: import("better-sqlite3").Database; name: string },
    operationId: string,
    cancel: boolean
  ) {
    const { db, name } = this.databaseForEvent(event);
    let record = this.contentState?.migration(operationId);
    if (!record && cancel && this.contentState) {
      const row = this.contentState.db
        .prepare(
          "SELECT document_id FROM migrations WHERE operation_id=? AND workspace_id=? AND json_extract(record,'$.phase')='PREPARING'"
        )
        .get(operationId, name) as { document_id: string } | undefined;
      if (row) {
        const session = this.requireSession(row.document_id);
        if (session.info.role !== "owner") throw new Error("只有所有者可以取消转换");
        const request = this.contentState.preparation(row.document_id)!;
        const { operation } = await this.client.request<{ operation: DocumentMigration }>(
          session.info.serverUrl,
          `/v1/documents/${row.document_id}/migrations/${operationId}/cancel`,
          "POST",
          { expectedEpoch: request.expectedEpoch }
        );
        this.contentState.finishPreparation(operation);
        this.unfreeze(session);
        session.provider?.attach();
        this.attach(session);
        this.changed(session);
        return;
      }
    }
    if (!record || record.plan.workspaceId !== name) throw new Error("升级操作不属于当前资料库");
    if (record.phase === "COMPLETE" && !cancel) return;
    const session = this.requireSession(record.plan.documentId);
    if (record.plan.remote) {
      const route = `/v1/documents/${session.info.id}/migrations/${operationId}`;
      let { operation } = await this.client.request<{ operation: DocumentMigration | null }>(
        session.info.serverUrl,
        route
      );
      if (cancel && operation?.state !== "COMMITTED")
        ({ operation } = await this.client.request<{ operation: DocumentMigration }>(
          session.info.serverUrl,
          `${route}/cancel`,
          "POST",
          { expectedEpoch: record.plan.expectedEpoch }
        ));
      if (!operation) throw new Error("服务端裁决尚未确认，保留本机副本并继续暂停");
      record = this.contentState!.observeRemote(operationId, operation);
      if (record.phase === "ABORTED" || record.phase === "EXPIRED") {
        this.unfreeze(session);
        session.provider?.attach();
        this.attach(session);
        this.changed(session);
        return;
      }
      if (operation.state === "PENDING") {
        if (record.plan.kind === "whiteboard") throw new Error("白板迁移须经白板文档入口处理");
        const recovery = new ContentRecoveryStore(this.directory, this.contentState!);
        const bytes = recovery.readFile(record.plan.recovery, "candidate.bin");
        ({ operation } = await this.client.request<{ operation: DocumentMigration }>(
          session.info.serverUrl,
          `${route}/commit`,
          "POST",
          { ...record.plan.fingerprint, state: bytes.toString("base64") }
        ));
        record = this.contentState!.observeRemote(operationId, operation);
        if (!record.decision) throw new Error("服务端未提交本次转换，请读取终态后重新准备");
      }
    } else if (cancel) {
      this.contentState!.decideLocal(operationId, "abort");
      this.unfreeze(session);
      this.changed(session);
      return;
    }
    if (!session.info.frozen) await this.freeze(session);
    const migration = new ContentMigration(
      this.contentState!,
      this.store,
      this.assets,
      new ContentRecoveryStore(this.directory, this.contentState!),
      current => databaseModule.getDatabase(name) === current && current.open
    );
    this.databaseForEvent(event);
    const doc = await migration.install(session.info.source ? db : undefined, operationId);
    const source = session.info.source;
    const installed = source ? ContentDocumentTable.read(db, source.contentId)! : undefined;
    const info = {
      ...session.info,
      source: source
        ? {
            ...source,
            librarySourceId: ContentIdentityTable.library(db)!.sourceId,
            contentDocumentId: installed!.documentId,
            projectionRevision: installed!.revision,
          }
        : undefined,
      error: undefined,
      frozen: false,
      remoteVersionAvailable: false,
    };
    for (const [viewId, view] of this.views)
      if (view.documentId === session.info.id) this.removeView(viewId);
    unregisterContentSession(session);
    session.provider?.destroy();
    session.awareness.destroy();
    session.doc.destroy();
    this.sessions.delete(session.info.id);
    this.store.metadata(info);
    const restored = this.restore(info, doc);
    if (info.status === "closed" && info.source) await this.demoteSession(restored);
    this.broadcast("collaboration:removed", { documentId: info.id, replaced: true });
    if (source) {
      emitContentWritten(db, source.contentId, "update");
      this.broadcast("content:updated", { databaseName: name, contentId: source.contentId });
    }
    this.changed();
  }

  private async adoptRemoteVersion(
    event: IpcMainInvokeEvent | { db: import("better-sqlite3").Database; name: string },
    id: string
  ) {
    const session = this.requireSession(id),
      { db, name } = this.databaseForEvent(event);
    if (
      session.info.mode === "local" ||
      !this.contentState ||
      (session.info.source && session.info.source.databaseName !== name)
    )
      throw new Error("请在原资料库切换共享版本");
    const pending = this.contentState
      .pendingMigrations()
      .find(record => record.plan.documentId === id);
    if (pending) {
      await this.finishContentUpgrade(event, pending.plan.operationId, false);
      return;
    }
    if (!session.info.frozen) await this.freeze(session);
    session.provider?.detach();
    await this.preserveSession(session);
    const protocol = await this.client.request<{
      version: number;
      epoch: number;
      baselineId: string;
      revision: string;
    }>(session.info.serverUrl, `/v1/documents/${id}/protocol`);
    if (
      protocol.version !== NODE_DOCUMENT_VERSION ||
      protocol.epoch <= Number(session.doc.getMap("meta").get("epoch") ?? 0)
    )
      throw new Error("没有可切换的新正文代次");
    const { state } = await this.client.request<{ state: string }>(
      session.info.serverUrl,
      `/v1/documents/${id}/state`,
      "GET",
      undefined,
      NODE_DOCUMENT_VERSION
    );
    const bytes = Buffer.from(state, "base64");
    if (createHash("sha256").update(bytes).digest("hex") !== protocol.revision)
      throw new Error("远端正文仍在变化，请重试切换");
    const snapshot = new Y.Doc({ gc: false });
    try {
      Y.applyUpdate(snapshot, bytes);
      await validateNodeDocument(snapshot, {
        documentId: id,
        baselineId: protocol.baselineId,
        epoch: protocol.epoch,
      });
      const migration = new ContentMigration(
        this.contentState,
        this.store,
        this.assets,
        new ContentRecoveryStore(this.directory, this.contentState)
      );
      const prepared = await migration.prepare(
        session.info.source ? db : undefined,
        session,
        {},
        { document: snapshot, workspaceId: name }
      );
      await this.finishContentUpgrade(event, prepared.plan.operationId, false);
    } finally {
      snapshot.destroy();
    }
  }

  private async connectEvents(url: string) {
    if (this.events.has(url) || this.stopped) return;
    const { ticket } = await this.client.request<{ ticket: string }>(url, "/v1/tickets", "POST", {
      documentId: null,
    });
    if (this.events.has(url) || this.stopped) return;
    const socket = new WebSocket(`${this.client.canonicalUrl(url).replace(/^http/, "ws")}/events`, {
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
      if (!getDevelopmentServerUrl()) {
        await this.client.migrateOfficialEndpoint();
        for (const [origin, transport] of this.transports) {
          const url = `${this.client.canonicalUrl(origin).replace(/^http/, "ws")}/ws`;
          if (transport.configuration.url !== url) transport.setConfiguration({ url });
        }
        for (const [origin, socket] of this.events)
          if (socket.url !== `${this.client.canonicalUrl(origin).replace(/^http/, "ws")}/events`)
            socket.close();
      }
      const urls = new Set([
        this.serverUrl,
        ...[...this.sessions.values()]
          .filter(session => session.info.mode !== "local")
          .map(session => session.info.serverUrl),
      ]);
      for (const url of urls) {
        if (!this.store.get(`identity:${url}`, null)) continue;
        try {
          const { documents } = await this.client.request<{
            documents: SharedDocumentInfo[];
          }>(url, "/v1/documents");
          for (const info of documents) {
            const roomKey = `${url}/${info.id}`;
            if (this.nonContentRooms.has(roomKey)) {
              if (this.whiteboardRooms.has(roomKey))
                this.whiteboardRooms.set(roomKey, { ...info, serverUrl: url });
              continue;
            }
            const existing = this.sessions.get(info.id);
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
                protocol.epoch > Number(existing.doc.getMap("meta").get("epoch") ?? 0) &&
                !this.contentState
                  ?.pendingMigrations()
                  .some(record => record.plan.documentId === info.id)
              ) {
                existing.info.remoteVersionAvailable = true;
                if (!existing.info.frozen) await this.freeze(existing);
                existing.provider?.detach();
                await this.preserveSession(existing);
              }
              this.store.metadata(existing.info);
              continue;
            }
            if (this.store.db.prepare("SELECT 1 FROM sessions WHERE id=?").get(info.id))
              throw new Error("该文档仍有未恢复的本机缓存，不能以远端快照覆盖");
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
                  continue;
                }
              }
              throw failure;
            }
            const doc = new Y.Doc();
            try {
              Y.applyUpdate(doc, Buffer.from(state, "base64"));
              if (doc.getMap("meta").get("version") === NODE_DOCUMENT_VERSION)
                await validateNodeDocument(doc, {
                  documentId: info.id,
                  baselineId: String(doc.getMap("meta").get("baselineId")),
                  epoch: Number(doc.getMap("meta").get("epoch")),
                });
              else validateDocument(doc);
            } catch (failure) {
              doc.destroy();
              throw failure;
            }
            const source = this.findLocalSource(info.id, url);
            const session: CollaborationSession = {
              ...info,
              serverUrl: url,
              source,
              connection: "connecting",
              pending: false,
              leaving: false,
            };
            this.store.create(session, doc);
            this.restore(session, doc);
          }
          const available = new Set(documents.map(info => info.id));
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
          this.error = undefined;
        } catch (error) {
          this.error = error instanceof Error ? error.message : "协作服务器暂时无法连接";
        }
      }
      this.changed();
    } finally {
      this.refreshing = false;
    }
  }

  private databaseForEvent(
    event: IpcMainInvokeEvent | { db: import("better-sqlite3").Database; name: string }
  ) {
    if (!("sender" in event)) {
      if (!event.db.open || databaseModule.getDatabase(event.name) !== event.db)
        throw new Error("资料库连接已变化，后台升级等待重新连接");
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
      const candidates = db
        .prepare("SELECT DISTINCT server_url FROM collaboration_bindings WHERE document_id=?")
        .all(documentId) as { server_url: string }[];
      for (const { server_url: origin } of candidates) {
        if (this.client.canonicalUrl(origin) !== this.client.canonicalUrl(serverUrl)) continue;
        const migrated = restoreContentBinding(db, name, documentId, origin);
        if (!migrated) continue;
        db.prepare(
          "UPDATE collaboration_bindings SET server_url=? WHERE document_id=? AND server_url=?"
        ).run(serverUrl, documentId, origin);
        return migrated;
      }
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
            throw new Error("正文正在转换，请先完成恢复");
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
          // 升级已回滚（文档仍是本机形态），恢复可编辑即可
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

  /** 首次共享只发布当前正文；原本机历史先进入独立恢复包。 */
  private async publishSession(
    event: IpcMainInvokeEvent,
    session: RuntimeSession,
    target: { contentId: number; sourceType?: SourceType; sourceId?: number; sourceTitle?: string }
  ) {
    if (session.doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION)
      throw new Error("请先在正文中完成协作格式转换，再发起共享");
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
      await this.preserveSession(session);
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
      throw new Error("共享准备后原正文已变化，原状态已保留，请恢复后重试");
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
        if (this.store.db.prepare("SELECT 1 FROM sessions WHERE id=?").get(info.id))
          throw new Error("共享缓存尚待恢复，不能覆盖原缓存");
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
   * 结束共享 = 降级回本机（走升级的同一条路径）：占位换回私有块真身、资产取回本地，
   * 同一个 Y.Doc 继续用，会话换回本机身份。
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
      if (!stored) throw new Error("主库基线尚未安装，请先恢复转换");
      const nextId = localSessionId(db.name, source.contentId, source.contentCreatedAt);
      if (this.store.db.prepare("SELECT 1 FROM sessions WHERE id=?").get(nextId))
        throw new Error("本机目标会话尚有旧副本，请先完成共享恢复");
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
          throw new Error("资料库已切换，请重试恢复");
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
    throw new Error("请先转换旧格式正文，再恢复本机编辑");
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
    if (this.store.get(`library-detached:${session.info.id}`, null)) return;
    if (!session.info.source || this.projecting.has(session.info.id)) return;
    const database = databaseModule.getDatabase(session.info.source.databaseName);
    if (!database?.open) return;
    this.projecting.add(session.info.id);
    try {
      const source = session.info.source;
      if (!source) return;
      const local = session.info.mode === "local";
      if (local && findCollaborationBinding(database, source.contentId)) return;
      if (session.info.status === "active" && !session.info.frozen && !session.info.leaving) {
        patchSessionNodes(session, diaryLinkPatcher(database));
      }
      session.projectionDirty = false;
      const stored = ContentDocumentTable.read(database, source.contentId);
      if (!stored) throw new Error("正文格式尚未安装，须先完成迁移恢复");
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
    await this.preserveSession(session);
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
    const workspace = session.info.source?.databaseName ?? "application";
    if (
      session.info.mode !== "local" ||
      session.info.pending ||
      this.store.legacyPrivateNodes(session.info.id).size ||
      this.contentState?.hasDocumentDrafts(workspace)
    )
      await this.preserveSession(session);
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

  /** 后台与交互入口复用同一冻结、保全和安装事务。 */
  async upgradeLegacyContent(
    name: string,
    contentId: number,
    contracts: ContentContractDictionary
  ) {
    const db = databaseModule.getDatabase(name);
    if (!db?.open || this.stopped) throw new Error("资料库未连接");
    const context = { db, name };
    const pending = this.contentState!.pendingMigrations().find(
      record =>
        record.plan.kind !== "whiteboard" &&
        record.plan.workspaceId === name &&
        this.sessions.get(record.plan.documentId)?.info.source?.contentId === contentId
    );
    if (!pending && ContentDocumentTable.read(db, contentId)) {
      const cached = this.store
        .list()
        .find(info => info.source?.databaseName === name && info.source.contentId === contentId);
      if (cached) this.requireSession(cached.id);
      const old = [...this.sessions.values()].find(
        session =>
          session.info.source?.databaseName === name &&
          session.info.source.contentId === contentId &&
          session.doc.getMap("meta").get("version") === 1
      );
      if (old) {
        if (!old.info.frozen) await this.freeze(old);
        await this.preserveSession(old);
        throw new Error("本机旧正文与已升级资料库存在不同基线，已保全，请核对本机恢复副本");
      }
      return;
    }
    const opened = await this.openContent(context, { contentId });
    const id = opened.documentId;
    await this.upgradeLegacySession(name, id, contracts);
    if (!ContentDocumentTable.read(db, contentId)) throw new Error("正文升级尚未完成，将自动续做");
    const restored = this.sessions.get(id);
    if (
      restored?.info.mode === "local" &&
      ![...this.views.values()].some(view => view.documentId === id)
    ) {
      unregisterContentSession(restored);
      restored.provider?.destroy();
      restored.awareness.destroy();
      restored.doc.destroy();
      this.sessions.delete(id);
    }
  }

  private legacyContentListener?: (name: string) => void;

  onLegacyContent(listener: (name: string) => void) {
    this.legacyContentListener = listener;
  }

  legacySessions(name: string) {
    return [...this.sessions.values()]
      .filter(
        session =>
          session.doc.getMap("meta").get("version") === 1 &&
          (session.info.source?.databaseName === name ||
            (!session.info.source && databaseModule.getCurrentDatabaseName() === name))
      )
      .map(session => session.info);
  }

  isLegacyUpgrade(record: import("./content-local-state").LocalMigrationRecord): boolean {
    if (record.plan.kind === "whiteboard") return false;
    const original = new Y.Doc({ gc: false });
    try {
      const recovery = new ContentRecoveryStore(this.directory, this.contentState!);
      Y.applyUpdate(original, recovery.readFile(record.plan.recovery, "document-before.bin"));
      return original.getMap("meta").get("version") === 1;
    } finally {
      original.destroy();
    }
  }

  isLegacySession(id: string): boolean {
    return this.requireSession(id).doc.getMap("meta").get("version") === 1;
  }

  private recordLegacyUpgradeIssues(
    name: string,
    session: RuntimeSession,
    record: import("./content-local-state").LocalMigrationRecord
  ) {
    if (record.plan.kind === "whiteboard") throw new Error("正文迁移目标不匹配");
    const manifest = new ContentRecoveryStore(this.directory, this.contentState!).manifest(
      record.plan.recovery
    );
    const issues = Array.isArray(manifest.provenance.issues) ? manifest.provenance.issues : [];
    const key = `legacy-upgrade-issues:${name}:${session.info.id}`;
    if (issues.length)
      this.store.set(key, {
        key: session.info.source
          ? `content:${session.info.source.contentId}`
          : `shared:${session.info.id}`,
        message: `有 ${issues.length} 处内容未能完整转换，原始载荷已保留，需要核对。保全位置：${record.plan.recovery.manifestPath}`,
      });
    else this.store.delete(key);
  }

  async upgradeLegacySession(name: string, id: string, contracts: ContentContractDictionary) {
    const db = databaseModule.getDatabase(name);
    if (!db?.open || this.stopped) throw new Error("资料库未连接");
    const context = { db, name },
      session = this.requireSession(id);
    if (session.info.source && session.info.source.databaseName !== name)
      throw new Error("正文资料库不匹配");
    const pending = this.contentState!.pendingMigrations(id).find(
      record => record.plan.documentId === id && record.plan.workspaceId === name
    );
    if (pending) {
      if (pending.plan.kind === "whiteboard") throw new Error("正文迁移目标不匹配");
      if (!pending.plan.remote) this.contentState!.continueLocal(pending.plan.operationId);
      this.recordLegacyUpgradeIssues(name, session, pending);
      await this.finishContentUpgrade(context, pending.plan.operationId, false);
      if (this.contentState!.migration(pending.plan.operationId)?.phase !== "COMPLETE")
        throw new Error("原转换已终止，将自动续做新的升级");
      return;
    }
    if (session.doc.getMap("meta").get("version") !== 1) return;
    if (session.info.mode !== "local" && session.info.status === "active") {
      const protocol = await this.client.request<{ version: number }>(
        session.info.serverUrl,
        `/v1/documents/${id}/protocol`
      );
      if (protocol.version === NODE_DOCUMENT_VERSION) {
        await this.adoptRemoteVersion(context, id);
        return;
      }
      if (session.info.role !== "owner") throw new Error("等待共享文档所有者的客户端自动升级版本");
    }
    const prepared = await this.prepareContentUpgrade(context, id, contracts);
    if (!prepared.recoveryId) throw new Error(prepared.error ?? "原始数据保全尚未完成");
    const record = this.contentState!.migration(prepared.operationId)!;
    if (record.plan.kind === "whiteboard") throw new Error("正文升级目标无效");
    if (!record.plan.remote) this.contentState!.continueLocal(prepared.operationId);
    this.recordLegacyUpgradeIssues(name, session, record);
    await this.finishContentUpgrade(context, prepared.operationId, false);
    if (this.requireSession(id).doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION)
      throw new Error("正文升级尚未完成，将自动续做");
  }

  documentMigration() {
    if (!this.contentState) throw new Error("文档迁移服务未就绪");
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
        if (this.store.get(`library-detached:${session.info.id}`, null)) continue;
        this.unfreeze(session);
        session.provider?.attach();
        this.attach(session);
        this.changed(session);
      }
    };
    try {
      for (const session of affected) {
        if (this.store.get(`library-detached:${session.info.id}`, null)) continue;
        if (!session.info.frozen) {
          resumed.push(session);
          await this.freeze(session);
        } else if (session.drainingViews?.size) throw new Error("正文仍有未确认输入，不能退出");
        session.provider?.detach();
        if (session.dirty) {
          this.store.compact(session.info.id, session.doc);
          session.dirty = false;
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

  async preserveLibrary(name: string): Promise<void> {
    if (!this.contentState) throw new Error("正文保全服务尚未就绪");
    if (
      this.store
        .list()
        .some(
          session =>
            session.source?.databaseName === name &&
            this.store.get(`library-detached:${session.id}`, null)
        )
    )
      throw new Error("请先处理上次替换留下的本机恢复副本，再次覆盖已停止");
    const recovery = new ContentRecoveryStore(this.directory, this.contentState);
    const filename = join(PathUtil.getAppDir(), `${name.replace(/\.db$/, "")}.db`);
    const open = databaseModule.getDatabase(name);
    if (!open?.open && !existsSync(filename)) return;
    const db = open?.open ? open : new Database(filename, { readonly: true, fileMustExist: true });
    const staging = mkdtempSync(join(recovery.directory, ".library-"));
    const journalPath = join(PathUtil.getAppDir(), "whiteboard-documents", "journal.db");
    const boardJournal = existsSync(journalPath)
      ? new Database(journalPath, { readonly: true, fileMustExist: true })
      : undefined;
    const boardIds = new Set(
      (
        db.prepare("SELECT document_id FROM whiteboard_documents").all() as {
          document_id: string;
        }[]
      ).map(row => row.document_id)
    );
    if (boardJournal)
      for (const row of boardJournal
        .prepare(
          "SELECT json_extract(identity,'$.documentId') AS id FROM documents WHERE json_extract(identity,'$.databaseName')=?"
        )
        .all(name) as { id: string }[])
        boardIds.add(row.id);
    try {
      const rows = [...this.sessions.values()].filter(
        session => session.info.source?.databaseName === name
      );
      if (rows.some(session => !session.info.frozen))
        throw new Error("资料库覆盖前仍有正文会话未完成冲刷");
      const dependencies = new ContentRetention(this.contentState).dependencies(
        db,
        name,
        (
          [
            ["content", "contents"],
            ["whiteboard-content", "white_board_contents"],
            ["data-table", "data_tables"],
          ] as const
        ).flatMap(([kind, table]) =>
          (db.prepare(`SELECT id FROM ${table}`).all() as { id: number }[]).map(row => ({
            kind,
            id: row.id,
          }))
        )
      );
      const references = contentRecoveryResources(db, dependencies);
      const boardResources = new Map<string, string[]>();
      const scanBoard = (id: string, state: Uint8Array) => {
        const doc = new Y.Doc();
        try {
          Y.applyUpdate(doc, state);
          boardResources.set(id, [
            ...new Set([
              ...(boardResources.get(id) ?? []),
              ...collectWhiteboardDocumentResources(doc),
            ]),
          ]);
        } finally {
          doc.destroy();
        }
      };
      for (const row of db.prepare("SELECT document_id,state FROM whiteboard_documents").all() as {
        document_id: string;
        state: Uint8Array;
      }[])
        scanBoard(row.document_id, row.state);
      if (boardJournal)
        for (const row of boardJournal
          .prepare(
            "SELECT json_extract(identity,'$.documentId') AS id,state FROM documents WHERE json_extract(identity,'$.databaseName')=?"
          )
          .all(name) as { id: string; state: Uint8Array }[])
          scanBoard(row.id, row.state);
      const files: ({ name: string; path: string } | { name: string; bytes: Uint8Array })[] = [];
      for (const [file, connection] of [
        ["main.db", db],
        ["collaboration.db", this.store.db],
        ...(boardJournal ? [["whiteboard-journal.db", boardJournal] as const] : []),
      ] as const) {
        const path = join(staging, file);
        await connection.backup(path);
        files.push({ name: file, path });
        if (file === "whiteboard-journal.db") {
          const snapshot = new Database(path);
          try {
            snapshot.pragma("secure_delete = ON");
            snapshot
              .prepare("DELETE FROM documents WHERE json_extract(identity,'$.databaseName')<>?")
              .run(name);
            snapshot.exec(
              "DELETE FROM updates WHERE document_id NOT IN (SELECT document_id FROM documents); DELETE FROM holds WHERE document_id NOT IN (SELECT document_id FROM documents)"
            );
            if (snapshot.prepare("SELECT 1 FROM sqlite_master WHERE name='remote_branches'").get())
              snapshot
                .prepare(
                  "DELETE FROM remote_branches WHERE json_extract(scope,'$[2]') NOT IN (SELECT value FROM json_each(?))"
                )
                .run(JSON.stringify([...boardIds]));
            snapshot.exec("VACUUM");
            snapshot.pragma("wal_checkpoint(TRUNCATE)");
          } finally {
            snapshot.close();
          }
        } else if (file !== "main.db") {
          const snapshot = new Database(path);
          try {
            snapshot.pragma("secure_delete = ON");
            snapshot
              .prepare(
                "DELETE FROM sessions WHERE coalesce(json_extract(metadata,'$.source.databaseName'),'')<>?"
              )
              .run(name);
            snapshot.exec(
              "DELETE FROM updates WHERE document_id NOT IN (SELECT id FROM sessions); DELETE FROM settings WHERE key LIKE 'identity:%' OR key='endpoint-aliases';"
            );
            snapshot
              .prepare(
                "DELETE FROM resources WHERE document_id NOT IN (SELECT id FROM sessions) AND document_id NOT IN (SELECT value FROM json_each(?))"
              )
              .run(JSON.stringify([...boardIds]));
            for (const table of [
              "node_views",
              "entity_holds",
              "migrations",
              "input_drafts",
              "document_drafts",
            ])
              snapshot
                .prepare(
                  `DELETE FROM ${table} WHERE workspace_id<>? AND workspace_id<>'application'`
                )
                .run(name);
            snapshot.exec("DELETE FROM recoveries");
            snapshot.exec("VACUUM");
            snapshot.pragma("wal_checkpoint(TRUNCATE)");
          } finally {
            snapshot.close();
          }
        }
      }
      const missing: string[] = [];
      const manifest: unknown[] = [];
      const ids = new Set([
        ...boardIds,
        ...rows.map(session => session.info.id),
        ...this.store
          .list()
          .filter(session => session.source?.databaseName === name)
          .map(session => session.id),
      ]);
      const represented = new Set<string>();
      for (const [index, id] of [...ids, ""].entries()) {
        const resources = this.assets.recoveryFiles(
          id,
          id
            ? (boardResources.get(id) ?? [])
            : references.filter(reference => !represented.has(reference)),
          "library-replacement"
        );
        resources.resources.forEach(resource => represented.add(resource.reference));
        missing.push(...resources.missing);
        for (const detail of resources.missingDetails)
          console.warn("[library-replacement:missing-resource]", {
            databaseName: name,
            documentId: id || null,
            ...detail,
          });
        const prefix = `assets-${index}-`;
        files.push(...resources.files.map(file => ({ ...file, name: prefix + file.name })));
        manifest.push({
          documentId: id || null,
          resources: resources.resources.map(resource => ({
            ...resource,
            file: resource.file ? prefix + resource.file : undefined,
          })),
        });
      }
      files.push({ name: "resources.json", bytes: Buffer.from(JSON.stringify(manifest)) });
      const receipt = recovery.save({
        workspaceId: name,
        reason: "library-replacement",
        provenance: {
          sourceId: ContentIdentityTable.library(db)?.sourceId ?? null,
          databasePath: db.name,
        },
        files,
        missing,
      });
      this.store.set(`library-recovery:${name}`, receipt);
      if (missing.length)
        console.warn("[library-replacement:resource-warning] 已备份本地资料，资源缺失不阻止覆盖", {
          databaseName: name,
          missingCount: missing.length,
          manifestPath: receipt.manifestPath,
        });
      for (const session of rows) {
        const key = `library-detached:${session.info.id}`;
        if (this.store.get(key, null)) continue;
        const stored = ContentDocumentTable.read(db, session.info.source!.contentId);
        const row = db
          .prepare("SELECT content FROM contents WHERE id=?")
          .get(session.info.source!.contentId) as { content: string } | undefined;
        this.store.set(key, {
          recoveryId: receipt.id,
          sourceId: ContentIdentityTable.library(db)?.sourceId ?? null,
          documentId: stored?.documentId ?? null,
          revision:
            stored?.revision ??
            createHash("sha256")
              .update(row?.content ?? "")
              .digest("hex"),
          frozen: Boolean(
            this.contentState
              .pendingMigrations()
              .some(record => record.plan.documentId === session.info.id) ||
            this.store.get(`publishing:${session.info.id}`, null)
          ),
        });
      }
    } finally {
      boardJournal?.close();
      if (db !== open) db.close();
      rmSync(staging, { recursive: true, force: true });
    }
  }

  private async useReplacedContent(event: IpcMainInvokeEvent, id: string): Promise<void> {
    const session = this.requireSession(id),
      { name } = this.databaseForEvent(event);
    const detached = this.store.get<{ recoveryId: string } | null>(`library-detached:${id}`, null);
    if (!detached || session.info.source?.databaseName !== name || !this.contentState)
      throw new Error("该会话不是当前资料库的待恢复副本");
    if (
      this.contentState.pendingMigrations().some(record => record.plan.documentId === id) ||
      this.store.get(`publishing:${id}`, null)
    )
      throw new Error("请先完成或取消原迁移、发布操作");
    const receipt = this.contentState.recovery(detached.recoveryId);
    if (!receipt) throw new Error("原内容的恢复回执缺失，不能解除关联");
    new ContentRecoveryStore(this.directory, this.contentState).verify(receipt);
    for (const [viewId, view] of this.views) if (view.documentId === id) this.removeView(viewId);
    unregisterContentSession(session);
    if (session.info.mode === "local") {
      session.awareness.destroy();
      session.doc.destroy();
      this.sessions.delete(id);
      this.store.remove(id);
    } else {
      session.info.source = undefined;
      this.retainNodeState(session, session.doc);
      this.unfreeze(session);
      session.provider?.attach();
      this.attach(session);
      this.changed(session);
    }
    this.store.delete(`library-detached:${id}`);
    this.contentState.replaceHolds(name, `document:${id}`, "undo", []);
    this.broadcast("collaboration:removed", { documentId: id, replaced: true });
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
    try {
      new ContentRecoveryStore(this.directory, this.contentState).recoverUnregistered();
    } catch {
      this.error = "存在未通过完整性校验的恢复材料，已保留原文件，相关迁移暂不可继续";
    }
    if (!this.store.get("localDeviceId", "")) this.store.set("localDeviceId", randomUUID());
    this.client = new CollaborationClient(this.store);
    if (!getDevelopmentServerUrl())
      await this.client.migrateOfficialEndpoint(true).catch(error => {
        this.error = error instanceof Error ? error.message : "协作端点升级暂时不可用";
      });
    this.assets = new CollaborationAssetService(
      this.store,
      PathUtil.getAppDir(),
      url => this.client.identity(url),
      url => this.client.canonicalUrl(url)
    );
    this.stopDocumentDrain = registerDurableDocuments({
      has: scope =>
        scope.reason === "database-change" || (scope.reason === "quit" && this.sessions.size > 0),
      prepare: scope => this.drainDatabase(scope),
    });
    const cachedSessions = this.store.list();
    if (this.store.failures.size)
      this.error = "部分协作缓存元数据不可读，原数据已保留，请通过恢复入口处理";
    const pendingDocuments = new Set(
      this.contentState.pendingMigrations().map(record => record.plan.documentId)
    );
    for (const info of cachedSessions) {
      if (
        info.mode === "local" &&
        info.source?.contentDocumentId &&
        !pendingDocuments.has(info.id) &&
        !this.contentState.preparation(info.id)
      )
        continue;
      // 单条损坏缓存不阻断其他会话；未确认编辑与本机真身可能无法从服务器补回。
      try {
        const { doc } = this.store.load(info.id);
        this.restore(info, doc);
      } catch (error) {
        const message = "本地协作缓存无法打开，原数据和资源已保留，恢复前暂停该会话";
        console.error(`[collaboration] 会话 ${info.id} ${message}`, error);
        this.store.metadata({ ...info, error: message });
        this.error = message;
      }
    }
    registerCollaborationIpc({
      prepareContentUpgrade: this.prepareContentUpgrade.bind(this),
      finishContentUpgrade: this.finishContentUpgrade.bind(this),
      useReplacedContent: this.useReplacedContent.bind(this),
      adoptRemoteVersion: this.adoptRemoteVersion.bind(this),
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
    setExtraTableRefsProvider(databaseName => this.collectPrivateTableRefs(databaseName));
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
