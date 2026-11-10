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
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import { createHash, randomUUID } from "node:crypto";
import { basename, join } from "node:path";
import {
  DEFAULT_COLLABORATION_URL,
  SOURCE_TYPES,
  replaceText,
  NODE_DOCUMENT_VERSION,
  WHITEBOARD_DOCUMENT_VERSION,
  readNodeDocument,
  buildScopedContentUpdate,
  validateScopedContentEdits,
  ScopedContentConflictError,
  ScopedUndoLimitError,
  type DocumentOperation,
  type ScopedContentSubmission,
  type ScopedContentResult,
  type ScopedContentEdits,
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
import { ContentSuggestionStore } from "./content-suggestions";
import { ContentSuggestionService, type ScopedWriteOptions } from "./suggestion-service";
import { AgentPresenceHub } from "./agent-presence";
import { AgentPermissionStore } from "./agent-permissions";
import type { TypingHost } from "./agent-typing";
import type { ContentSuggestionRow } from "./content-suggestions";
import { MAIN_AGENT_NAME } from "@/services/agent-identity";
import { broadcastDatabaseChange } from "../database-notifications";
import { CONTENT_AGENT_PRESENCE_CHANGED } from "@/types/agent-presence";
import { registerDurableEntityHolds } from "../durable-entity-holds";
import { getDevelopmentServerUrl } from "./dev-server";
import { findCollaborationBinding } from "../collaboration-guard";
import { emitContentWritten } from "../content-events";
import { localSessionId } from "./session-identity";
import { collaborationImageStorage } from "../../services/collaboration-image-storage";
import {
  findContentTitle,
  projectContentTitle,
  projectContractContent,
  projectContentBlocks,
  contentProjectionChanges,
  readContentProjectionHead,
  registerContentSession,
  contentSession,
  unregisterContentSession,
  contentRevision,
} from "./content-sessions";
import { desktopContentMetrics } from "../../../../shared/content-metrics";
import { reportContentSaveIssue, reportContentSaveComplete } from "./persistence-diagnostics";

export class CollaborationManager {
  name = "collaboration";
  private store!: CollaborationLocalStore;
  private nodeUpdates?: NodeSessionUpdates;
  private contentState?: ContentLocalState;
  private stopContentRetention?: () => void;
  private stopDocumentDrain?: () => void;
  private assets!: CollaborationAssetService;
  private client!: CollaborationClient;
  private contentSuggestions?: ContentSuggestionService;
  private presenceHub?: AgentPresenceHub;
  private permissionStore?: AgentPermissionStore;
  private projecting = new Map<string, Promise<void>>();
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
        // 旧版本因远端换代冻结的缓存不再冻结：联网刷新时按远端快照重建
        remoteVersionAvailable: false,
        frozen: Boolean(this.store.get(`publishing:${info.id}`, null)),
        connection: info.mode === "local" ? "connected" : "connecting",
      },
      doc,
      awareness: new Awareness(doc),
      assets: this.assets,
      store: this.store,
      dirty: true,
      projectionDirty: true,
      projectionVersion: { content: 0, contracts: 0 },
      projectionTree: new NodeTree(doc),
      projectionNodes: new Map(),
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
    doc.on(
      "update",
      (update: Uint8Array, origin: unknown, _doc: Y.Doc, transaction: Y.Transaction) => {
        session.dirty = true;
        session.projectionDirty = true;
        const version = session.projectionVersion!;
        const changes = contentProjectionChanges(doc, transaction);
        const treeChanges = session.projectionTree?.transactionChanges(transaction);
        if (changes.content) {
          version.content++;
          if (!treeChanges || treeChanges.structural) session.projectionStructure = version.content;
          for (const id of treeChanges?.nodes ?? [])
            session.projectionNodes?.set(id, version.content);
        }
        if (changes.contracts) version.contracts++;
        if (origin !== "renderer-persisted") {
          try {
            this.store.append(session.info.id, update);
          } catch (error) {
            session.cacheWriteFailed = true;
            session.info.error = `正文缓存尚未保存：${error instanceof Error ? error.message : String(error)}`;
            reportContentSaveIssue(session, "journal", error, { bytes: update.byteLength });
            throw error;
          }
        }
        try {
          this.retainNodeState(session, doc);
        } catch (failure) {
          session.info.error = failure instanceof Error ? failure.message : "实体持有记录尚未保存";
          this.changed(session);
        }
        if (session.info.mode !== "local" && origin !== session.provider)
          session.info.pending = true;
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
        const nodeEvents = transaction.changedParentTypes.get(doc.share.get("node-tree:nodes")!);
        // 文字输入沿用已有任务身份，结构或 taskId 变化才需要重新核对。
        const needsTaskIds =
          treeChanges?.structural ||
          nodeEvents?.some(
            event =>
              event instanceof Y.YMapEvent &&
              (event.keysChanged.has("type") || event.keysChanged.has("taskId"))
          );
        if (
          changes.content &&
          needsTaskIds &&
          db?.open &&
          contentSession(db, source!.contentId) === session
        )
          ContentTable.ensureTaskIds(db, source!.contentId);
        // 用户或别处的改动可能让待处理建议的锚点或原文前提失效，停顿后按当前正文核对
        if (changes.content && source)
          this.suggestions.scheduleValidation(
            source.databaseName.replace(/\.db$/, ""),
            source.contentId,
            () => (this.sessions.get(session.info.id) === session ? session.doc : undefined)
          );
      }
    );
    const source = session.info.source;
    const db = source && databaseModule.getDatabase(source.databaseName);
    if (db?.open && source) {
      registerContentSession(db, source.contentId, session);
      if (session.info.status === "active") ContentTable.ensureTaskIds(db, source.contentId);
    }
    // 会话恢复（重开正文、重启应用）时核对一次：关着期间正文可能经别处改过
    if (source)
      this.suggestions.scheduleValidation(
        source.databaseName.replace(/\.db$/, ""),
        source.contentId,
        () => (this.sessions.get(session.info.id) === session ? session.doc : undefined)
      );
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
    // 协作中的正文以会话为准，不按主库修复
    if (!findCollaborationBinding(db, target.contentId))
      await repairContentForOpen(
        db,
        name,
        target.contentId,
        () => databaseModule.getDatabase(name) === db
      );
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
        stored.contracts,
        { allowLocalResources: true }
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
  private async syncRemoteDocument(url: string, info: SharedDocumentInfo): Promise<void> {
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
        // 远端已换代：旧缓存不能合入新基线，备份后按服务器确认快照重建，编辑视图随 replaced 事件重开
        await this.releaseRemoteSession(existing, "协作端基线已变化");
        return this.syncRemoteDocument(url, info);
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
      const expectedRevision = source.projectionRevision;
      if (
        stored.revision !== expectedRevision ||
        (source.contentDocumentId && stored.documentId !== source.contentDocumentId) ||
        (source.librarySourceId &&
          ContentIdentityTable.library(db)?.sourceId !== source.librarySourceId)
      )
        throw new Error("最终正文的来源或修订已变化，已保留共享副本");
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

  private contentUpdates() {
    return (this.nodeUpdates ??= new NodeSessionUpdates(this.store, this.contentState));
  }

  get suggestions() {
    return (this.contentSuggestions ??= new ContentSuggestionService(
      new ContentSuggestionStore(this.store.db),
      this.applyScopedEdit.bind(this),
      this.typingHost.bind(this),
      (db, contentId) => contentSession(db, contentId)?.doc,
      (db, contentId, agent) => this.agentPermissions.level(db, contentId, agent)
    ));
  }

  get agentPermissions() {
    return (this.permissionStore ??= new AgentPermissionStore(this.store.db));
  }

  /** 直接改的落地环境：正文会话（没打开就先打开）、按块检查有没有人在编辑、光标随写随走 */
  private async typingHost(
    db: import("better-sqlite3").Database,
    contentId: number,
    row: ContentSuggestionRow
  ): Promise<TypingHost | undefined> {
    const workspaceId = basename(db.name, ".db");
    if (!contentSession(db, contentId))
      await this.openContent({ db, name: workspaceId }, { contentId });
    const session = this.sessionOfContent(workspaceId, contentId);
    if (!session) return undefined;
    const agent = row.agent_label ?? MAIN_AGENT_NAME;
    return {
      local: session.info.mode === "local",
      session: () => {
        const current = this.sessionOfContent(workspaceId, contentId);
        return current && { doc: current.doc, awareness: current.awareness };
      },
      submit: (request, assertCanWrite) =>
        this.applyScopedEdit(db, contentId, request, { assertCanWrite }),
      receipt: operationId => {
        const result = this.store.get<{ inverse?: ScopedContentEdits } | null>(
          this.scopedEditReceiptKey({
            documentId: row.document_id,
            baselineId: row.baseline_id,
            epoch: row.epoch,
            operationId,
          }),
          null
        );
        return result ? { status: "committed", inverse: result.inverse } : undefined;
      },
      moved: caret =>
        this.agentPresence.set(workspaceId, contentId, {
          agent,
          owner: row.conversation_key,
          status: "busy",
          action: "正在改这段",
          caret,
          block: caret.blockId,
          editing: true,
        }),
      delay: ms => new Promise(resolve => setTimeout(resolve, ms)),
    };
  }

  /** 正文当前的主进程会话（按库与正文 ID 找，打开着才有） */
  private sessionOfContent(workspaceId: string, contentId: number) {
    for (const session of this.sessions.values()) {
      const source = session.info.source;
      if (
        source?.contentId === contentId &&
        source.databaseName.replace(/\.db$/, "") === workspaceId &&
        !session.doc.isDestroyed
      )
        return session;
    }
  }

  get agentPresence() {
    return (this.presenceHub ??= new AgentPresenceHub({
      doc: (workspaceId, contentId) => {
        const session = this.sessionOfContent(workspaceId, contentId);
        return session && { documentId: session.info.id, doc: session.doc };
      },
      broadcastAwareness: (documentId, update) =>
        this.broadcast("collaboration:awareness", { documentId, update }),
      changed: (workspaceId, contentId) =>
        broadcastDatabaseChange(CONTENT_AGENT_PRESENCE_CHANGED, workspaceId, { contentId }),
    }));
  }

  /** 视图订阅时的完整在场：会话里各视图的状态 + 这篇正文上 Agent 的状态 */
  presenceSnapshot(session: RuntimeSession) {
    const keys = [...session.awareness.getStates().keys()];
    const source = session.info.source;
    const agents = source
      ? this.agentPresence.updates(source.databaseName.replace(/\.db$/, ""), source.contentId)
      : [];
    if (!agents.length) return encodeAwarenessUpdate(session.awareness, keys);
    const merged = new Awareness(new Y.Doc());
    try {
      merged.setLocalState(null);
      applyAwarenessUpdate(merged, encodeAwarenessUpdate(session.awareness, keys), "snapshot");
      for (const update of agents) applyAwarenessUpdate(merged, update, "snapshot");
      return encodeAwarenessUpdate(merged, [...merged.getStates().keys()]);
    } finally {
      merged.destroy();
      merged.doc.destroy();
    }
  }

  async readEditSnapshot(db: import("better-sqlite3").Database, contentId: number) {
    const name = basename(db.name, ".db");
    if (!contentSession(db, contentId)) await this.openContent({ db, name }, { contentId });
    const session = contentSession(db, contentId);
    if (!session) throw new Error("正文会话未就绪");
    const identity = readDocumentIdentity(session.doc);
    const candidate = new Y.Doc({ gc: false });
    try {
      if (session.info.mode !== "local") {
        const remote = await this.client.request<{ state: string }>(
          session.info.serverUrl,
          `/v1/documents/${session.info.id}/state`,
          "GET",
          undefined,
          NODE_DOCUMENT_VERSION
        );
        Y.applyUpdate(candidate, Buffer.from(remote.state, "base64"));
        const confirmed = readDocumentIdentity(candidate);
        if (
          confirmed.documentId !== identity.documentId ||
          confirmed.epoch !== identity.epoch ||
          confirmed.baselineId !== identity.baselineId
        )
          throw new Error("DOCUMENT_CHANGED: 正文基线已变化，请重新读取");
      }
      if (contentSession(db, contentId) !== session) throw new Error("正文会话已变化");
      Y.applyUpdate(candidate, Y.encodeStateAsUpdate(session.doc));
      return {
        content: readNodeDocument(candidate).content,
        state: Y.encodeStateAsUpdate(candidate),
        identity,
        revision: contentRevision(session),
      };
    } finally {
      candidate.destroy();
    }
  }

  private scopedEditReceiptKey(request: Omit<ScopedContentSubmission, "scope">) {
    return `scoped-edit:${request.documentId}:${request.baselineId}:${request.epoch}:${request.operationId}`;
  }

  async applyScopedEdit(
    db: import("better-sqlite3").Database,
    contentId: number,
    request: ScopedContentSubmission,
    { assertCanWrite, signal, undo }: ScopedWriteOptions = {}
  ): Promise<ScopedContentResult> {
    assertCanWrite?.();
    validateScopedContentEdits(request.scope);
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(request.operationId)) throw new Error("编辑操作 ID 无效");
    if (!contentSession(db, contentId))
      await this.openContent({ db, name: basename(db.name, ".db") }, { contentId });
    const session = contentSession(db, contentId);
    if (!session) return { status: "rejected", reason: "DOCUMENT_CHANGED" };
    const check = () => {
      assertCanWrite?.();
      const identity = readDocumentIdentity(session.doc);
      if (
        session.info.frozen ||
        session.info.leaving ||
        session.info.status !== "active" ||
        contentSession(db, contentId) !== session ||
        identity.documentId !== request.documentId ||
        identity.baselineId !== request.baselineId ||
        identity.epoch !== request.epoch
      )
        throw new Error("DOCUMENT_CHANGED: 正文会话已变化，请重新读取");
    };
    check();
    const encoded = JSON.stringify(request.scope);
    const updateHash = createHash("sha256").update(encoded).digest("hex");
    if (session.info.mode === "local") {
      const key = this.scopedEditReceiptKey(request);
      let inverse: ScopedContentEdits | undefined;
      try {
        await this.contentUpdates().apply(
          session,
          {
            bytes: Buffer.byteLength(encoded),
            build: async () => {
              const previous = this.store.get<{
                hash: string;
                inverse?: ScopedContentEdits;
              } | null>(key, null);
              if (previous) {
                if (previous.hash !== updateHash) throw new Error("操作身份已被另一请求使用");
                inverse = previous.inverse;
                return null;
              }
              const prepared = await buildScopedContentUpdate(session.doc, request.scope, { undo });
              inverse = prepared.inverse;
              return prepared.update;
            },
            commit: () => this.store.set(key, { hash: updateHash, inverse }),
          },
          check
        );
      } catch (error) {
        if (error instanceof ScopedContentConflictError)
          return { status: "conflict", conflicts: error.conflicts };
        if (error instanceof ScopedUndoLimitError)
          return { status: "rejected", reason: error.code };
        throw error;
      }
      void this.project(session).catch(error => {
        session.info.error = error instanceof Error ? error.message : "正文投影尚未保存";
        this.changed(session);
      });
      return { status: "committed", inverse };
    }
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
      await validateNodeDocument(candidate, identity, session.doc, {
        allowLocalResources: session.info.mode === "local",
      });
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
      await this.contentUpdates().apply(session, update, () => {
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

  private project(session: RuntimeSession): Promise<void> {
    if (session.doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION)
      return Promise.resolve();
    const id = session.info.id;
    const pending = this.projecting.get(id);
    if (pending) return pending;
    const task = this.projectSession(session).finally(() => {
      if (this.projecting.get(id) === task) this.projecting.delete(id);
    });
    this.projecting.set(id, task);
    return task;
  }

  private async projectSession(session: RuntimeSession) {
    const started = performance.now();
    let stage = "checkpoint",
      path = "idle",
      selectedBlocks = 0,
      writtenBlocks = 0;
    let committed = false;
    let storageBefore: number | null | undefined;
    let expectedRevision: string | undefined, actualRevision: string | undefined;
    try {
      // 异步补存期间收到的新更新仍须触发下一轮投影。
      session.projectionDirty = false;
      if (session.cacheWriteFailed) {
        this.store.compact(session.info.id, session.doc);
        session.cacheWriteFailed = false;
        session.dirty = false;
      }
      stage = "assets";
      await this.preserveOwnerImages(session);
      const source = session.info.source;
      if (!source) {
        session.projectionDirty = true;
        return;
      }
      const database = databaseModule.getDatabase(source.databaseName);
      if (!database?.open) {
        session.projectionDirty = true;
        reportContentSaveIssue(session, "database-unavailable");
        return;
      }
      const local = session.info.mode === "local";
      if (local && findCollaborationBinding(database, source.contentId)) {
        session.projectionDirty = true;
        reportContentSaveIssue(session, "binding-changed");
        return;
      }
      stage = "identity";
      expectedRevision = source.projectionRevision;
      const head = readContentProjectionHead(database, source, session);
      actualRevision = head.revision;
      storageBefore = head.formatVersion;
      // 只确认本轮快照的代次，异步期间到达的新事务留给下一轮。
      const version = session.projectionVersion && { ...session.projectionVersion };
      const confirmed = session.projectedVersion;
      const changes =
        version && confirmed
          ? {
              content: version.content !== confirmed.content,
              contracts: version.contracts !== confirmed.contracts,
            }
          : undefined;
      if (changes && head.revision !== source.projectionRevision)
        throw new Error("正文投影修订冲突，已保留原缓存并暂停写入");
      let changed = false;
      if (!changes || changes.content || changes.contracts) {
        const contracts = session.doc
          .getMap("node-tree:contracts")
          .toJSON() as ContentContractDictionary;
        const tree = session.projectionTree;
        const incremental = Boolean(changes && tree);
        const structural = Boolean(
          incremental && changes!.content && (session.projectionStructure ?? 0) > confirmed!.content
        );
        path = !incremental
          ? "reconcile"
          : structural
            ? "structure"
            : changes!.content
              ? "blocks"
              : "contracts";
        let content: ContentNode[];
        if (changes && !changes.content) content = [];
        else if (incremental && !structural) {
          const roots = new Set<string>();
          for (const [id, changedAt] of session.projectionNodes ?? []) {
            if (changedAt <= confirmed!.content || changedAt > version!.content) continue;
            const root = tree!.rootBlockId(id);
            if (root) roots.add(root);
          }
          content = [...roots].map(id => tree!.nodeSnapshot(id));
        } else
          content = tree
            ? (tree.snapshot() as ContentNode[])
            : readNodeDocument(session.doc).content;
        if (content.length) {
          stage = "localize";
          const meta = session.doc.getMap("meta");
          const value = await this.assets.localizeDocument(
            session.info.serverUrl,
            session.info.id,
            {
              title: session.doc.getText("title").toString(),
              bannerBg: String(meta.get("bannerBg")),
              bannerPosition: String(meta.get("bannerPosition")),
              content,
            },
            contracts
          );
          content = value.content;
        }
        selectedBlocks = content.length;
        if (
          databaseModule.getDatabase(source.databaseName) !== database ||
          !database.open ||
          this.sessions.get(session.info.id) !== session
        ) {
          session.projectionDirty = true;
          reportContentSaveIssue(session, "target-changed");
          return;
        }
        stage = "commit";
        if (incremental) {
          const result = projectContentBlocks(database, source, session, {
            documentId: head.documentId,
            expectedRevision: source.projectionRevision!,
            contracts,
            blocks: content,
            order: structural ? content.map(node => String(node.collabId)) : undefined,
            count: blocks => getContentLength(blocks as import("slate").Descendant[]),
            countRules: JSON.stringify(desktopContentMetrics.rules),
          });
          changed = result.changed;
          writtenBlocks = result.writtenBlocks;
        } else
          changed = projectContractContent(
            database,
            source,
            session,
            { documentId: head.documentId, contracts, content },
            source.projectionRevision,
            getContentLength(content as import("slate").Descendant[]),
            changes
          );
        committed = true;
      }
      stage = "acknowledge";
      const saved = readContentProjectionHead(database, source, session);
      source.projectionRevision = saved.revision;
      session.projectedVersion = version;
      for (const [id, changedAt] of session.projectionNodes ?? [])
        if (version && changedAt <= version.content) session.projectionNodes!.delete(id);
      this.store.metadata(session.info);
      stage = "notify";
      const title = session.doc.getText("title").toString();
      for (const entry of projectContentTitle(database, source.contentId, title))
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
      session.info.title = title;
      if ((local || session.info.error?.startsWith("正文缓存尚未保存：")) && session.info.error) {
        session.info.error = undefined;
        this.changed(session);
      }
      if (version && session.projectionVersion)
        session.projectionDirty =
          version.content !== session.projectionVersion.content ||
          version.contracts !== session.projectionVersion.contracts;
      reportContentSaveComplete(session, {
        path,
        changed,
        selectedBlocks,
        writtenBlocks,
        elapsedMs: Math.round(performance.now() - started),
        storageBefore,
        storageAfter: saved.formatVersion,
      });
    } catch (error) {
      session.projectionDirty = true;
      reportContentSaveIssue(session, stage, error, {
        elapsedMs: Math.round(performance.now() - started),
        committed,
        expectedRevision,
        actualRevision,
      });
      throw error;
    }
  }

  private async preserveOwnerImages(session: RuntimeSession, references?: Iterable<string>) {
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
    this.assets.removeDocumentCache(session.info.id);
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
            .prepare("SELECT create_time FROM content_snapshots WHERE id=?")
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

  /** 共享会话的缓存不能继续使用：原始字节备份后拆除会话，调用方随后按服务器内容重建。 */
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
        this.assets.removeDocumentCache(id);
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
    for (const table of [
      "input_drafts",
      "document_drafts",
      "node_views",
      "entity_holds",
      "migrations",
    ])
      this.store.db
        .prepare(`DELETE FROM ${table} WHERE workspace_id IN (?,?)`)
        .run(name, name.endsWith(".db") ? name.slice(0, -3) : `${name}.db`);
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
      nodeUpdates: this.contentUpdates(),
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
      presenceSnapshot: this.presenceSnapshot.bind(this),
      clearBinding: this.clearBinding.bind(this),
      discardLocal: this.discardLocal.bind(this),
      removeSession: this.removeSession.bind(this),
      finishLeave: this.finishLeave.bind(this),
      flushResources: this.flushResources.bind(this),
    });
    for (const window of BrowserWindow.getAllWindows()) this.registerWindow(window);
    app.on("browser-window-created", (_event, window) => this.registerWindow(window));
    this.startAutoFlush();
    this.refreshInterval = setInterval(() => void this.refresh(), 15000);
    this.refreshInterval.unref();
    void this.refresh();
  }

  private startAutoFlush() {
    this.autoFlushInterval = setInterval(() => {
      for (const session of this.sessions.values()) {
        try {
          if (
            session.dirty &&
            (session.cacheWriteFailed || this.store.shouldCompact(session.info.id))
          ) {
            this.store.compact(session.info.id, session.doc);
            session.dirty = false;
            session.cacheWriteFailed = false;
          }
          if (session.projectionDirty && !session.info.leaving && session.info.status === "active")
            void this.project(session).catch(error => {
              session.info.error = error instanceof Error ? error.message : "本地保存失败";
              this.changed(session);
            });
        } catch (error) {
          reportContentSaveIssue(session, "checkpoint", error);
          session.info.error = error instanceof Error ? error.message : "本地保存失败";
          this.changed(session);
        }
      }
      void this.flushResources();
    }, 1000);
    this.autoFlushInterval.unref();
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
    this.contentSuggestions?.dispose();
    this.presenceHub?.dispose();
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
