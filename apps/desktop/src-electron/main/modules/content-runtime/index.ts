import { app, BrowserWindow, type Event, type IpcMainInvokeEvent } from "electron";
import * as Y from "yjs";
import { Awareness, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import type Database from "better-sqlite3";
import {
  createNodeDocument,
  readNodeDocument,
  validateNodeDocument,
  NODE_DOCUMENT_VERSION,
  SOURCE_TYPES,
  NodeTree,
  type ContentNode,
  type ContentSessionTarget,
  type ScopedContentSubmission,
  type ContentSessionSnapshot,
  type CollaborationSession,
  type SourceBinding,
} from "@tau/collaboration";
import { applyNodeTreeContent } from "@tau/editor-collab";
import {
  CONTENT_ENTITY_NODE_CONTRACTS,
  isContentEntityReference,
  type ContentEntityReference,
} from "@tau/db-schema/content-identities";
import {
  canonicalContractJson,
  type ContentContractDictionary,
} from "@tau/db-schema/content-contracts";
import databaseModule from "../database";
import ContentTable from "../tables/content";
import { findCollaborationBinding } from "../collaboration-guard";
import { emitContentWritten } from "../content-events";
import {
  hasDurableDocuments,
  prepareDurableDocuments,
  registerDurableDocuments,
  type DocumentDrain,
  type DocumentDrainScope,
} from "../durable-document-lifecycle";
import { registerDurableEntityHolds } from "../durable-entity-holds";
import { desktopContentMetrics } from "../../../../shared/content-metrics";
import { getContentLength } from "@/utils/helper";
import type { CollaborationLocalStore } from "../collaboration/local-store";
import type { CollaborationAssetService } from "../collaboration/asset-service";
import { type ContentLocalState, sourceDraftKey } from "../collaboration/content-local-state";
import type { NodeSessionUpdates } from "../collaboration/node-session-updates";
import type { ContentRetention } from "../collaboration/content-retention";
import { localSessionId } from "../collaboration/session-identity";
import { bindingMatches, restoreContentBinding } from "../collaboration/content-repository";
import {
  reportContentSaveIssue,
  reportContentSaveComplete,
} from "../collaboration/persistence-diagnostics";
import type { RuntimeSession, CollaborationView } from "../collaboration/types";
import {
  contentProjectionChanges,
  contentRevision,
  contentSession,
  findContentTitle,
  projectContentTitle,
  registerContentSession,
  unregisterContentSession,
} from "../collaboration/content-sessions";
import { registerLocalContentIpc } from "./ipc";
import type { ContentAgent, ContentAgentHost } from "./agent";
import type { ScopedWriteOptions } from "./agent/suggestion-service";
import { recoverContentDrafts } from "./recovery";
import type { ContentProjectionStore } from "./content-projection";
import { ContentSessionLifecycle, matchesDocumentScope } from "./content-session-lifecycle";
import type { LocalContentSource } from "./local-content-source";
import {
  contentDemotionKey,
  readContentDemotion,
  stageContentDemotion,
  type StagedContentDemotion,
} from "./local-content-demotion";
import type {
  ContentOpenContext,
  LocalContentSharingAccess,
  PreparedContentShare,
  PublishedContentShare,
  SharedContentBridge,
  SharedSessionEffects,
} from "./sharing";

export type ContentDatabase = { db: Database.Database; name: string };

export interface ContentRuntimeStorage {
  store: CollaborationLocalStore;
  assets: CollaborationAssetService;
  contentState: ContentLocalState;
  nodeUpdates: NodeSessionUpdates;
  retention: Pick<ContentRetention, "has">;
  source(
    db: Database.Database,
    name: string,
    contentId: number
  ): Pick<LocalContentSource, "shared" | "repair" | "head" | "snapshot">;
  projection(
    db: Database.Database,
    source: SourceBinding,
    owner: Pick<CollaborationSession, "id" | "mode" | "serverUrl">
  ): ContentProjectionStore;
}

/** 每个正文运行时独立管理会话、视图、日志和关停屏障。 */
export class ContentSessionRuntime implements LocalContentSharingAccess {
  protected sessions = new Map<string, RuntimeSession>();
  protected views = new Map<string, CollaborationView>();
  protected projecting = new Map<RuntimeSession, Promise<void>>();
  protected stopContentRetention?: () => void;
  protected stopDocumentDrain?: () => void;
  private stopDatabaseReconnect?: () => void;
  private stopLocalIpc?: () => void;
  private stopWindowRegistration?: () => void;
  private readonly frozenForDownload = new Set<RuntimeSession>();
  protected freezeWaiters = new Map<string, { id: string; resolve(): void }>();
  protected closingWindows = new Set<number>();
  protected autoFlushInterval: ReturnType<typeof setInterval> | null = null;

  private contentAgent?: ContentAgent;
  private readonly lifecycle = new ContentSessionLifecycle();
  private readonly draining = new Set<RuntimeSession>();
  private readonly idleClosures = new WeakMap<RuntimeSession, object>();
  private sharing?: SharedContentBridge;

  constructor(
    private readonly storage: ContentRuntimeStorage,
    private readonly host:
      | { createAgent(host: ContentAgentHost): ContentAgent }
      | SharedSessionEffects
  ) {}

  private get sharedEffects() {
    return "createAgent" in this.host ? undefined : this.host;
  }

  protected get store() {
    return this.storage.store;
  }

  protected get assets() {
    return this.storage.assets;
  }

  protected get contentState() {
    return this.storage.contentState;
  }

  connectSharing(sharing: SharedContentBridge) {
    this.sharing = sharing;
    return () => {
      if (this.sharing === sharing) this.sharing = undefined;
    };
  }

  private async openSharedContent(
    event: ContentOpenContext,
    target: ContentSessionTarget,
    check: () => void
  ) {
    if (!this.sharing) {
      const { default: modules } = await import("../../module-init/ModuleInitManager");
      const ready = await modules.initModule("collaboration");
      if (!ready.success) throw new Error("COLLABORATION_UNAVAILABLE: " + ready.error);
    }
    check();
    if (!this.sharing) throw new Error("COLLABORATION_UNAVAILABLE: 共享服务尚未就绪");
    return this.sharing.open(event, target, check);
  }

  get agent(): ContentAgent {
    if (!("createAgent" in this.host)) throw new Error("正文 Agent 由本机运行时提供");
    return (this.contentAgent ??= this.host.createAgent({
      openForDatabase: this.openForDatabase.bind(this),
      acceptUpdates: this.acceptUpdates.bind(this),
      save: this.save.bind(this),
      reportSaveFailure: this.reportSaveFailure.bind(this),
      findContent: (workspaceId, contentId) =>
        this.findContent(workspaceId, contentId) ??
        this.sharing?.findContent(workspaceId, contentId),
      broadcastPresence: (documentId, update) => {
        this.broadcast("collaboration:awareness", { documentId, update });
        this.sharing?.broadcastPresence(documentId, update);
      },
      readSharedState: this.readSharedAgentState.bind(this),
      submitSharedEdit: this.submitSharedAgentEdit.bind(this),
    }));
  }

  private async readSharedAgentState(session: RuntimeSession): Promise<Uint8Array> {
    if (!this.sharing) throw new Error("COLLABORATION_UNAVAILABLE: 共享服务尚未就绪");
    return this.sharing.readAgentState(session);
  }

  private async submitSharedAgentEdit(
    session: RuntimeSession,
    request: ScopedContentSubmission,
    updateHash: string,
    check: () => void,
    options: ScopedWriteOptions
  ): Promise<import("@tau/collaboration").ScopedContentResult> {
    if (!this.sharing) throw new Error("COLLABORATION_UNAVAILABLE: 共享服务尚未就绪");
    return this.sharing.submitAgentEdit(session, request, updateHash, check, options);
  }

  presenceSnapshot(session: RuntimeSession): Uint8Array {
    return this.agent.presenceSnapshot(session);
  }

  scheduleSuggestionValidation(
    workspaceId: string,
    contentId: number,
    document: () => Y.Doc | undefined
  ) {
    try {
      if (this.sharedEffects)
        this.sharedEffects.scheduleSuggestionValidation(workspaceId, contentId, document);
      else this.agent.suggestions.scheduleValidation(workspaceId, contentId, document);
    } catch (error) {
      console.warn(
        "[local-content] 正文建议校验未调度",
        error instanceof Error ? error.name : "Error"
      );
    }
  }

  async open(event: ContentOpenContext, target: ContentSessionTarget) {
    return this.beginOpen(event, target);
  }

  openForDatabase(db: Database.Database, contentId: number) {
    const name = [...databaseModule.databases].find(([, connection]) => connection === db)?.[0];
    if (!name) throw new Error("资料库连接已变化，请重新打开正文");
    return this.open({ db, name }, { contentId });
  }

  resumeLocalOpen(event: ContentOpenContext, target: ContentSessionTarget, check: () => void) {
    return this.beginOpen(event, target, check);
  }

  private beginOpen(
    event: ContentOpenContext,
    target: ContentSessionTarget,
    parentCheck?: () => void
  ) {
    parentCheck?.();
    if (target.sourceType && !SOURCE_TYPES.includes(target.sourceType))
      throw new Error("不支持的内容来源，请升级客户端");
    if (!Number.isSafeInteger(target.contentId) || target.contentId <= 0)
      throw new Error("内容 ID 不合法");
    const binding = this.databaseForEvent(event);
    const { db, name } = binding;
    const windowId =
      "sender" in event ? BrowserWindow.fromWebContents(event.sender)?.id : undefined;
    return this.lifecycle.open(
      db,
      { databaseName: name, windowId },
      target.contentId,
      async active => {
        const check = () => {
          parentCheck?.();
          active();
          if (
            !db.open ||
            databaseModule.getDatabase(name) !== db ||
            this.databaseForEvent(event).db !== db
          )
            throw new Error("资料库已切换，请重新打开内容");
        };
        check();
        const snapshot = await this.openContent(event, target, binding, check);
        check();
        return snapshot;
      },
      parentCheck !== undefined
    );
  }

  /** 发起共享先排空本机视图，再由共享方接管。 */
  install(info: CollaborationSession, doc: Y.Doc) {
    this.store.create(info, doc);
    return this.restore(info, doc);
  }
  stageDemotion(info: CollaborationSession, doc: Y.Doc) {
    if (this.sessions.has(info.id)) throw new Error("本机正文仍在编辑，请稍后重试");
    this.store.db.transaction(() => {
      // 冷缓存保全后让位，避免旧会话 ID 在安装前重新载入旧正文。
      this.store.discard(info.id, "结束共享时发现旧本机缓存");
      stageContentDemotion(this.store, info, doc);
    })();
  }

  restoreDemotion({ db, name }: ContentDatabase, id: string): RuntimeSession | undefined {
    const key = contentDemotionKey(id);
    const plan = this.store.get<StagedContentDemotion | null>(key, null);
    if (!plan) return;
    const source = plan.info?.source;
    if (!db.open || databaseModule.getDatabase(name) !== db || source?.databaseName !== name)
      return;
    if (plan.info.id !== id || plan.info.mode !== "local" || this.sessions.has(id))
      throw new Error("结束共享的本机会话身份已变化");
    const repository = this.storage.source(db, name, source.contentId);
    if (repository.shared()) return;
    const head = repository.head();
    if (
      !head ||
      id !== localSessionId(db.name, source.contentId, head.createdAt) ||
      head.createdAt !== source.contentCreatedAt ||
      !head.librarySourceId ||
      head.librarySourceId !== source.librarySourceId ||
      !head.documentId ||
      head.documentId !== source.contentDocumentId ||
      !head.revision ||
      head.revision !== source.projectionRevision
    ) {
      // 较新的主库内容已经取代交接候选，继续按当前主库重建。
      this.store.delete(key);
      return;
    }
    const doc = readContentDemotion(plan, id);
    try {
      this.store.db.transaction(() => {
        this.store.create(plan.info, doc);
        this.store.delete(key);
      })();
      return this.restore(plan.info, doc);
    } finally {
      if (this.sessions.get(id)?.doc !== doc) doc.destroy();
    }
  }
  getSession(id: string) {
    return this.requireSession(id);
  }
  find(id: string) {
    return this.findSession(id);
  }
  activeSession(id: string) {
    return this.sessions.get(id);
  }
  activeSessions() {
    return this.sessions.values();
  }
  isProjecting(session: RuntimeSession) {
    return this.projecting.has(session);
  }
  get ipcViews() {
    return this.views;
  }
  async prepareShare(session: RuntimeSession) {
    await this.freeze(session);
  }
  pendingShare(id: string): PreparedContentShare | null {
    return this.store.get<PreparedContentShare | null>(`publishing:${id}`, null);
  }
  rememberShare(id: string, value: PreparedContentShare): void {
    this.store.set(`publishing:${id}`, value);
  }
  cancelShare(session: RuntimeSession) {
    this.unfreeze(session);
  }
  save(session: RuntimeSession) {
    return this.project(session);
  }
  async finishPublishedShare(id: string, source: SourceBinding, published: PublishedContentShare) {
    const pending = this.pendingShare(id);
    if (
      !pending ||
      pending.documentId !== published.documentId ||
      pending.serverUrl !== published.serverUrl ||
      pending.baselineId !== published.baselineId ||
      published.epoch !== 0
    )
      return;

    const active = this.sessions.get(id);
    let cached: ReturnType<CollaborationLocalStore["load"]> | undefined;
    if (!active && this.store.db.prepare("SELECT 1 FROM sessions WHERE id=?").get(id)) {
      try {
        // 核对冻结候选时只读冷缓存，避免把已经交接的正文重新注册为本机会话。
        cached = this.store.load(id);
      } catch {
        return;
      }
    }
    try {
      const original = active ?? cached;
      if (original) {
        const binding = original.info.source;
        if (
          original.info.mode !== "local" ||
          (active && !active.info.frozen) ||
          !binding ||
          binding.databaseName.replace(/\.db$/, "") !== source.databaseName.replace(/\.db$/, "") ||
          binding.contentId !== source.contentId ||
          binding.contentCreatedAt !== source.contentCreatedAt ||
          !source.librarySourceId ||
          binding.librarySourceId !== source.librarySourceId ||
          !source.contentDocumentId ||
          binding.contentDocumentId !== source.contentDocumentId ||
          contentRevision(original) !== pending.revision
        )
          return;
      }
    } finally {
      cached?.doc.destroy();
    }

    const clearCandidate = () => this.store.delete(`publishing:${id}`);
    if (active) await this.removeSession(active, clearCandidate);
    else {
      this.removeStoredSession(id, clearCandidate);
      this.assets.removeDocumentCache(id);
    }
  }
  findContent(workspaceId: string, contentId: number) {
    return [...this.sessions.values()].find(
      session =>
        session.info.source?.contentId === contentId &&
        session.info.source.databaseName.replace(/\.db$/, "") === workspaceId &&
        !session.doc.isDestroyed
    );
  }
  reportSaveFailure(session: RuntimeSession, error: unknown) {
    session.info.error = error instanceof Error ? error.message : String(error);
    this.changed(session);
  }
  acceptUpdates(...args: Parameters<NodeSessionUpdates["apply"]>) {
    return this.contentUpdates().apply(...args);
  }

  startLocal(): void {
    const { store, contentState, assets, nodeUpdates } = this.storage;
    this.initDurability(true);
    this.stopDatabaseReconnect = databaseModule.onDatabaseConnected((name, reason) => {
      if (reason !== "sync_download_reconnect") return;
      for (const session of this.frozenForDownload) {
        if (session.info.source?.databaseName !== name) continue;
        this.frozenForDownload.delete(session);
        if (this.sessions.get(session.info.id) === session) this.unfreeze(session);
      }
    });
    this.stopLocalIpc = registerLocalContentIpc({
      nodeUpdates,
      store,
      contentState,
      assets,
      views: this.views,
      openContent: this.open.bind(this),
      findSession: id => this.findSession(id) ?? this.sharing?.find(id),
      requireSession: this.requireSession.bind(this),
      databaseForEvent: this.databaseForEvent.bind(this),
      checkLocalSubscribe: (event, windowId, session) => {
        const { db, name } = this.databaseForEvent(event);
        this.lifecycle.assertOpen({ databaseName: name, windowId });
        if (
          session &&
          (!session.info.source || contentSession(db, session.info.source.contentId) !== session)
        )
          throw new Error("内容不属于当前数据库，请重新打开内容");
      },
      changed: this.changed.bind(this),
      removeView: this.removeView.bind(this),
      acknowledgeFreeze: this.acknowledgeFreeze.bind(this),
      presenceSnapshot: session => this.agent.presenceSnapshot(session),
      user: () => ({ id: this.store.get("localDeviceId", "local"), nickname: "本机" }),
    });
    for (const window of BrowserWindow.getAllWindows()) this.registerWindow(window);
    const register = (_event: Event, window: BrowserWindow) => this.registerWindow(window);
    app.on("browser-window-created", register);
    this.stopWindowRegistration = () => app.off("browser-window-created", register);
    this.startAutoFlush();
  }

  initDurability(protectUntilSharingReady = false) {
    const { retention } = this.storage;
    this.stopContentRetention = registerDurableEntityHolds((db, kind, id) => {
      const workspaceId = [...databaseModule.databases].find(([, value]) => value === db)?.[0];
      return (
        workspaceId === undefined ||
        (protectUntilSharingReady &&
          !this.sharing &&
          Boolean(
            db.prepare("SELECT 1 FROM sqlite_master WHERE name='collaboration_bindings'").get() &&
            db.prepare("SELECT 1 FROM collaboration_bindings LIMIT 1").get()
          )) ||
        [...this.sessions.values()].some(
          session =>
            session.info.source?.databaseName === workspaceId &&
            (session.projectionDirty || Boolean(session.info.error))
        ) ||
        retention.has(db, workspaceId, kind, id)
      );
    }, "content");
    if (!this.store.get("localDeviceId", "")) this.store.set("localDeviceId", randomUUID());
    this.stopDocumentDrain = registerDurableDocuments({
      has: scope => this.hasViews(scope),
      prepare: scope => this.drainDatabase(scope),
    });
  }

  private sessionsForDrain(scope: DocumentDrainScope) {
    return [...this.sessions.values()].filter(
      session =>
        (scope.reason === "quit" || session.info.source) &&
        (scope.reason !== "database-sync" || session.info.mode === "local") &&
        matchesDocumentScope(
          { databaseName: scope.databaseName },
          { databaseName: session.info.source?.databaseName }
        ) &&
        (scope.windowId === undefined ||
          [...this.views.values()].some(
            view => view.documentId === session.info.id && view.windowId === scope.windowId
          ))
    );
  }

  protected hasViews(scope: DocumentDrainScope) {
    return this.lifecycle.hasOpening(scope) || this.sessionsForDrain(scope).length > 0;
  }

  shutdown(): void {
    this.contentAgent?.dispose();
    this.contentAgent = undefined;
    if (this.autoFlushInterval) clearInterval(this.autoFlushInterval);
    this.stopContentRetention?.();
    this.stopContentRetention = undefined;
    this.stopDocumentDrain?.();
    this.stopDocumentDrain = undefined;
    this.stopDatabaseReconnect?.();
    this.stopDatabaseReconnect = undefined;
    this.stopLocalIpc?.();
    this.stopLocalIpc = undefined;
    this.stopWindowRegistration?.();
    this.stopWindowRegistration = undefined;
    this.frozenForDownload.clear();
    this.lifecycle.clear();
    this.draining.clear();
  }

  broadcast(channel: string, value: unknown) {
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
  changed(session?: RuntimeSession) {
    if (session) this.store.metadata(session.info);
    if (session?.info.mode === "local") {
      this.broadcast("collaboration:session-error", {
        documentId: session.info.id,
        error: session.info.error,
      });
      return;
    }
    this.sharedEffects?.broadcastState();
  }

  protected restore(info: CollaborationSession, doc: Y.Doc) {
    if (doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION)
      throw new Error("CONTENT_FORMAT_UNSUPPORTED: 正文格式不受支持");
    if (info.source && !Number.isSafeInteger(info.source.contentCreatedAt))
      info.source = this.findLocalSource(info.id, info.serverUrl);
    const session: RuntimeSession = {
      info: {
        ...info,
        // 旧版本因远端换代冻结的缓存不再冻结：联网刷新时按远端快照重建
        remoteVersionAvailable: false,
        frozen: Boolean(info.leaving || this.pendingShare(info.id)),
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
    session.replaceContent = (content, contracts, expectedRevision, checkScope, onAccepted) =>
      this.replaceContentSnapshot(
        session,
        content,
        contracts,
        expectedRevision,
        checkScope,
        onAccepted
      );
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
        const authoritative = this.contentUpdates().isApplyingAuthoritativeState(session, origin);
        if (origin !== "renderer-persisted" && !authoritative) {
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
        if (session.info.mode !== "local" && origin !== session.provider && !authoritative)
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
          this.scheduleSuggestionValidation(
            source.databaseName.replace(/\.db$/, ""),
            source.contentId,
            () => (this.sessions.get(session.info.id) === session ? session.doc : undefined)
          );
      }
    );
    const source = session.info.source;
    const db = source && databaseModule.getDatabase(source.databaseName);
    const ownsBinding =
      db?.open &&
      source &&
      (session.info.mode === "local" || bindingMatches(db, source, info.id, info.serverUrl));
    if (ownsBinding) {
      registerContentSession(db, source.contentId, session);
      if (session.info.status === "active") ContentTable.ensureTaskIds(db, source.contentId);
    }
    // 会话恢复（重开正文、重启应用）时核对一次：关着期间正文可能经别处改过
    if (source && (!db?.open || ownsBinding))
      this.scheduleSuggestionValidation(
        source.databaseName.replace(/\.db$/, ""),
        source.contentId,
        () => (this.sessions.get(session.info.id) === session ? session.doc : undefined)
      );
    this.sharedEffects?.attach(session);
    return session;
  }
  protected retainNodeState(session: RuntimeSession, doc: Y.Doc) {
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
  protected findSession(id: string): RuntimeSession | undefined {
    return this.sessions.get(id) ?? this.loadCached(id);
  }
  /** 恢复冷缓存；打不开的缓存备份后丢弃并返回 undefined，由调用方按远端或主库重建。 */
  loadCached(
    id: string,
    info?: CollaborationSession,
    check?: (info: CollaborationSession) => void
  ): RuntimeSession | undefined {
    if (!this.store.db.prepare("SELECT 1 FROM sessions WHERE id=?").get(id)) return undefined;
    let doc: Y.Doc | undefined;
    try {
      const cached = this.store.load(id);
      doc = cached.doc;
      check?.(cached.info);
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
  requireSession(id: string): RuntimeSession {
    const session = this.findSession(id);
    if (!session || session.info.leaving) throw new Error("正文会话已失效，请重新打开");
    return session;
  }

  protected async openContent(
    event: ContentOpenContext,
    target: ContentSessionTarget,
    { db, name }: ContentDatabase,
    check: () => void
  ): Promise<ContentSessionSnapshot> {
    const { contentId } = target;
    const repository = this.storage.source(db, name, contentId);
    if (repository.shared()) return this.openSharedContent(event, target, check);
    await repository.repair(check);
    check();
    if (repository.shared()) return this.openSharedContent(event, target, check);

    const head = repository.head();
    if (!head) throw new Error("内容不存在");
    const id = localSessionId(db.name, contentId, head.createdAt);
    const hasViews = () => [...this.views.values()].some(view => view.documentId === id);
    const matches = (source: SourceBinding, current: typeof head | undefined) =>
      current &&
      source.contentCreatedAt === current.createdAt &&
      (!source.librarySourceId || source.librarySourceId === current.librarySourceId) &&
      (!source.contentDocumentId || source.contentDocumentId === current.documentId);
    let session =
      this.sessions.get(id) ??
      this.restoreDemotion({ db, name }, id) ??
      this.loadCached(id, undefined, info => {
        if (info.mode === "local" && info.source && !matches(info.source, head))
          throw new Error("资料库或正文身份已变化");
      });
    const source = session?.info.source;
    if (session) this.idleClosures.delete(session);
    if (session?.info.mode === "local" && source) {
      if (!matches(source, head)) {
        this.releaseReplacedSession(session);
        return this.openContent(event, target, { db, name }, check);
      }
      const recovered = session;
      if (!hasViews() && !session.info.frozen) {
        if (
          this.contentState &&
          source.librarySourceId &&
          source.contentDocumentId &&
          source.projectionRevision === head.revision
        ) {
          await recoverContentDrafts(
            this.store,
            this.contentState,
            session.info,
            session.doc,
            () => {
              try {
                check();
              } catch {
                return false;
              }
              if (
                this.sessions.get(id) !== recovered ||
                recovered.info.source !== source ||
                recovered.info.frozen ||
                hasViews() ||
                repository.shared()
              )
                return false;
              const latest = repository.head();
              return Boolean(
                matches(source, latest) &&
                latest?.revision === head.revision &&
                source.projectionRevision === head.revision
              );
            }
          );
        }
        check();
        if (repository.shared()) return this.openSharedContent(event, target, check);
        const latest = repository.head();
        if (
          this.sessions.get(id) !== session ||
          session.info.source !== source ||
          !matches(source, latest)
        )
          throw new Error("正文在打开期间已变化，请重试");
        if (
          latest?.revision &&
          source.projectionRevision !== latest.revision &&
          !hasViews() &&
          !session.info.frozen
        ) {
          // 先保全未投影输入，有修订冲突时再备份缓存并从主库重建。
          try {
            await this.project(session);
          } catch (error) {
            check();
            if (repository.shared()) return this.openSharedContent(event, target, check);
            if (this.sessions.get(id) !== session || session.info.source !== source)
              throw new Error("正文在打开期间已变化，请重试");
            if (repository.head()?.revision === source.projectionRevision) throw error;
            console.warn(`[collaboration] 正文 ${contentId} 的缓存落后于主库，已备份后按主库重建`);
            this.releaseReplacedSession(session, "主库在缓存之后被改写");
            return this.openContent(event, target, { db, name }, check);
          }
        }
      }
      check();
      if (repository.shared()) return this.openSharedContent(event, target, check);
      if (
        this.sessions.get(id) !== session ||
        session.info.source !== source ||
        !matches(source, repository.head())
      )
        throw new Error("正文在打开期间已变化，请重试");
    }
    if (!session) {
      const stored = repository.snapshot();
      if (!stored) throw new Error("CONTENT_FORMAT_UNSUPPORTED: 正文格式不受支持");
      if (!head.librarySourceId) throw new Error("正文缺少资料库来源身份");
      const source: SourceBinding = {
        ...target,
        databaseName: name,
        contentCreatedAt: head.createdAt,
        librarySourceId: head.librarySourceId,
        contentDocumentId: stored.documentId,
        projectionRevision: stored.revision,
      };
      const title =
        target.sourceType !== "card" && target.sourceTitle !== undefined
          ? target.sourceTitle
          : findContentTitle(db, contentId);
      const value = { title, content: stored.content, bannerBg: "", bannerPosition: "center" };
      const prepared = await this.assets.prepareLocalDocument(id, value, stored.contracts);
      check();
      const doc = await createNodeDocument(
        { documentId: id, baselineId: randomUUID(), epoch: 0 },
        prepared,
        stored.contracts,
        { allowLocalResources: true }
      );
      try {
        check();
        if (repository.shared()) return this.openSharedContent(event, target, check);
        if (this.sessions.has(id)) return this.openContent(event, target, { db, name }, check);
        const latest = repository.head();
        if (!matches(source, latest) || latest?.revision !== stored.revision)
          throw new Error("正文在打开期间已变化，请重试");
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
      } finally {
        if (this.sessions.get(id)?.doc !== doc) doc.destroy();
      }
    }
    if (session.info.source?.contentCreatedAt !== head.createdAt)
      throw new Error("原内容关联已变化");
    registerContentSession(db, contentId, session);
    ContentTable.ensureTaskIds(db, contentId);
    return {
      documentId: id,
      mode: session.info.mode || "shared",
      title: session.doc.getText("title").toString(),
      frozen: Boolean(session.info.frozen),
      source: session.info.source,
    };
  }

  acknowledgeFreeze(viewId: string, requestId?: string) {
    const view = this.views.get(viewId);
    const session = view && this.sessions.get(view.documentId);
    const waiter = session && this.freezeWaiters.get(session.info.id);
    if (waiter ? waiter.id !== requestId : requestId !== undefined) return;
    if (!session?.drainingViews) return;
    session.drainingViews.delete(viewId);
    if (!session.drainingViews.size) waiter?.resolve();
  }

  async freeze(session: RuntimeSession) {
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

  removeWindowViews(windowId: number) {
    this.lifecycle.cancelOpening({ windowId });
    for (const [id, view] of this.views) if (view.windowId === windowId) this.removeView(id);
  }

  protected registerWindow(window: BrowserWindow) {
    window.webContents.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace) {
        this.removeWindowViews(window.id);
        this.sharing?.removeWindowViews(window.id);
      }
    });
    window.webContents.on("render-process-gone", () => {
      this.removeWindowViews(window.id);
      this.sharing?.removeWindowViews(window.id);
    });
    window.on("close", event => {
      const scope = { windowId: window.id, reason: "window-close" as const };
      if (!hasDurableDocuments(scope)) return;
      event.preventDefault();
      if (this.closingWindows.has(window.id)) return;
      this.closingWindows.add(window.id);
      void prepareDurableDocuments(scope)
        .then(drain => {
          drain.commit();
          if (!window.isDestroyed()) window.destroy();
        })
        .catch(error => {
          if (!window.isDestroyed())
            window.webContents.send("collaboration:save-blocked", {
              message: `部分内容未能确认保存，窗口已保留。${error instanceof Error ? error.message : String(error)}`,
            });
        })
        .finally(() => this.closingWindows.delete(window.id));
    });
    window.once("closed", () => {
      this.removeWindowViews(window.id);
      this.sharing?.removeWindowViews(window.id);
    });
  }

  unfreeze(session: RuntimeSession) {
    session.info.frozen = false;
    session.drainingViews = undefined;
    this.broadcast("collaboration:freeze", { documentId: session.info.id, frozen: false });
  }

  databaseForEvent(
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
  findLocalSource(documentId: string, serverUrl: string) {
    for (const [name, db] of databaseModule.databases) {
      if (!db.open) continue;
      const source = restoreContentBinding(db, name, documentId, serverUrl);
      if (source) return source;
    }
  }
  contentUpdates() {
    return this.storage.nodeUpdates;
  }

  protected async replaceContentSnapshot(
    session: RuntimeSession,
    content: ContentNode[],
    supplied: ContentContractDictionary | undefined,
    expectedRevision: string | undefined,
    checkScope?: () => void,
    onAccepted?: () => void
  ): Promise<void> {
    const source = session.info.source;
    const database = source && databaseModule.getDatabase(source.databaseName);
    const checkSession = () => {
      checkScope?.();
      if (
        source &&
        (session.info.source !== source ||
          !database?.open ||
          databaseModule.getDatabase(source.databaseName) !== database)
      )
        throw new Error("资料库连接已变化，请重新读取正文");
      if (
        session.info.frozen ||
        session.info.leaving ||
        session.info.status !== "active" ||
        this.sessions.get(session.info.id) !== session
      )
        throw new Error("正文会话已变化，请重新读取");
    };
    if (!expectedRevision)
      throw new Error("CONTENT_VERSION_CONFLICT: 正文缺少观察修订，请重新读取");
    const checkRevision = () => {
      checkSession();
      if (contentRevision(session) !== expectedRevision)
        throw new Error("CONTENT_VERSION_CONFLICT: 正文已变化，请保留待应用结果后重试");
    };
    const shared = session.info.mode === "local" ? undefined : this.sharedEffects;
    if (!shared && session.info.mode !== "local")
      throw new Error("COLLABORATION_UNAVAILABLE: 共享服务尚未就绪");
    const intentHash = shared
      ? createHash("sha256")
          .update(canonicalContractJson([expectedRevision, content, supplied ?? null]))
          .digest("hex")
      : "";
    checkSession();
    if (shared && (await shared.retryReplacement(session, intentHash, checkSession, onAccepted))) {
      await this.project(session);
      return;
    }
    checkRevision();
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
      checkRevision();
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
      checkRevision();
      const update = Y.encodeStateAsUpdate(candidate, vector),
        operationId = randomUUID(),
        candidateState = Y.encodeStateAsUpdate(candidate);
      if (shared) {
        await shared.submitReplacement(
          session,
          {
            operationId,
            intentHash,
            expectedRevision,
            update,
            candidateState,
            retainCandidate: () => this.retainNodeState(session, candidate),
          },
          checkRevision,
          checkSession,
          onAccepted
        );
        await this.project(session);
        return;
      }
      this.contentState.saveDocumentDraft(
        { workspaceId: session.info.source?.databaseName ?? "application", ...identity },
        `operation:${operationId}`,
        { state: candidateState, sequence: 1 }
      );
      this.retainNodeState(session, candidate);
      await this.contentUpdates().apply(
        session,
        update,
        () => {
          if (
            this.sessions.get(session.info.id) !== session ||
            session.doc.getMap("meta").get("baselineId") !== identity.baselineId
          )
            throw new Error("正文会话已变化，待应用结果已保留");
          checkRevision();
        },
        onAccepted
      );
      await this.project(session);
    } finally {
      tree.dispose();
      candidate.destroy();
    }
  }

  project(session: RuntimeSession): Promise<void> {
    if (session.doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION)
      return Promise.resolve();
    const pending = this.projecting.get(session);
    if (pending) return pending;
    const task = this.projectSession(session).finally(() => {
      this.projecting.delete(session);
    });
    this.projecting.set(session, task);
    return task;
  }

  protected async projectSession(session: RuntimeSession) {
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
      const source = session.info.source;
      const database = source && databaseModule.getDatabase(source.databaseName);
      stage = "assets";
      await this.sharedEffects?.preserveOwnerImages(session);
      if (
        !source ||
        !database?.open ||
        databaseModule.getDatabase(source.databaseName) !== database ||
        this.sessions.get(session.info.id) !== session ||
        session.info.source !== source
      ) {
        session.projectionDirty = true;
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
      const projection = this.storage.projection(database, source, session.info);
      const head = projection.readHead();
      actualRevision = head.revision;
      storageBefore = head.formatVersion;
      if (!local && expectedRevision && expectedRevision !== head.revision)
        throw new Error("共享正文投影修订已变化，原共享会话仍保留");
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
      if (changes && head.revision !== expectedRevision)
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
          this.sessions.get(session.info.id) !== session ||
          session.info.source !== source
        ) {
          session.projectionDirty = true;
          reportContentSaveIssue(session, "target-changed");
          return;
        }
        stage = "commit";
        // 资源本地化期间，其他入口可能已提交并推进会话观察到的修订。
        const result = projection.commit(
          incremental
            ? {
                kind: "blocks",
                documentId: head.documentId,
                expectedRevision: expectedRevision!,
                contracts,
                blocks: content,
                order: structural ? content.map(node => String(node.collabId)) : undefined,
                count: blocks => getContentLength(blocks as import("slate").Descendant[]),
                countRules: JSON.stringify(desktopContentMetrics.rules),
              }
            : {
                kind: "snapshot",
                documentId: head.documentId,
                expectedRevision,
                contracts,
                content,
                count: getContentLength(content as import("slate").Descendant[]),
                changes,
              }
        );
        changed = result.changed;
        writtenBlocks = result.writtenBlocks;
        committed = true;
      }
      stage = "acknowledge";
      const saved = projection.readHead();
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

  private removeStoredSession(id: string, onRemove?: () => void) {
    this.store.db.transaction(() => {
      this.store.remove(id);
      this.contentState?.db
        .prepare("DELETE FROM entity_holds WHERE holder=?")
        .run(`document:${id}`);
      onRemove?.();
    })();
  }

  async removeSession(session: RuntimeSession, onRemove?: () => void) {
    const id = session.info.id;
    if (this.sessions.get(id) !== session) return;
    const freeze =
      !session.info.frozen && [...this.views.values()].some(view => view.documentId === id);
    if (freeze) await this.freeze(session);
    if (this.sessions.get(id) !== session) return;
    try {
      this.removeStoredSession(id, onRemove);
    } catch (error) {
      if (freeze) this.unfreeze(session);
      throw error;
    }
    for (const [viewId, view] of this.views) if (view.documentId === id) this.removeView(viewId);
    unregisterContentSession(session);
    session.provider?.destroy();
    session.awareness.destroy();
    session.doc.destroy();
    this.sessions.delete(id);
    this.frozenForDownload.delete(session);
    this.assets.removeDocumentCache(id);
    this.broadcast("collaboration:removed", { documentId: id });
    this.changed();
  }

  discardRemoteSession(session: RuntimeSession, reason: string) {
    const id = session.info.id;
    if (this.sessions.get(id) !== session) return;
    for (const [viewId, view] of this.views) if (view.documentId === id) this.removeView(viewId);
    unregisterContentSession(session);
    session.provider?.destroy();
    if (session.dirty) this.store.compact(id, session.doc);
    this.store.discard(id, reason);
    session.awareness.destroy();
    session.doc.destroy();
    this.sessions.delete(id);
    this.contentState.db.prepare("DELETE FROM entity_holds WHERE holder=?").run(`document:${id}`);
    this.broadcast("collaboration:removed", { documentId: id, replaced: true });
  }

  protected drainDatabase(scope: DocumentDrainScope): Promise<DocumentDrain> {
    return this.lifecycle.drain(scope, () => this.prepareSessionDrain(scope));
  }

  private async prepareSessionDrain(scope: DocumentDrainScope): Promise<DocumentDrain> {
    const affected = this.sessionsForDrain(scope).map(session => {
      const source = session.info.source;
      return {
        session,
        source,
        database: source && databaseModule.getDatabase(source.databaseName),
      };
    });
    if (affected.some(({ session }) => this.draining.has(session)))
      throw new Error("正文正在保存并关闭，请稍后重试");
    for (const { session } of affected) this.draining.add(session);
    const resumed: RuntimeSession[] = [];
    const resume = () => {
      for (const session of resumed) {
        if (this.sessions.get(session.info.id) !== session || !session.info.frozen) continue;
        this.unfreeze(session);
        session.provider?.attach();
        this.sharedEffects?.attach(session);
      }
    };
    const release = () => {
      for (const { session } of affected) this.draining.delete(session);
    };
    const rollback = () => {
      release();
      resume();
    };
    try {
      for (const { session, source, database } of affected) {
        if (!session.info.frozen) {
          resumed.push(session);
          await this.freeze(session);
        } else if (session.drainingViews?.size) throw new Error("正文仍有未确认输入，不能退出");
        const check = () => {
          if (
            this.sessions.get(session.info.id) !== session ||
            session.info.source !== source ||
            (source &&
              (databaseModule.getDatabase(source.databaseName) !== database ||
                database?.open === false))
          )
            throw new Error("保存期间资料库或正文会话已变化，请重试");
        };
        check();
        session.provider?.detach();
        if (session.dirty || session.cacheWriteFailed) {
          this.store.compact(session.info.id, session.doc);
          session.dirty = false;
          session.cacheWriteFailed = false;
        }
        if (source && database?.open) {
          const head = this.storage.source(database, source.databaseName, source.contentId).head();
          const matches =
            head?.createdAt === source.contentCreatedAt &&
            (!source.librarySourceId || source.librarySourceId === head.librarySourceId) &&
            (!source.contentDocumentId || source.contentDocumentId === head.documentId);
          if (!matches) {
            // 来源变化时只确认日志耐久，避免把旧正文投影到新库。
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
        check();
        if (session.info.mode === "local" && database?.open && session.projectionDirty) {
          // 等到的保存可能在最后一批排空输入前就捕获了候选。
          await this.project(session);
          check();
          if (session.projectionDirty) throw new Error("正文仍有未保存的修改，请重试");
        }
      }
      return {
        commit: () => {
          release();
          if (scope.reason === "quit") return;
          if (scope.reason === "database-sync" && scope.replace) {
            for (const session of resumed)
              if (this.sessions.get(session.info.id) === session)
                this.frozenForDownload.add(session);
          } else {
            if (scope.reason === "database-change" && scope.windowId !== undefined) {
              const drainedIds = new Set(affected.map(({ session }) => session.info.id));
              for (const [id, view] of this.views)
                if (view.windowId === scope.windowId && drainedIds.has(view.documentId))
                  this.removeView(id);
            }
            resume();
          }
          if (scope.reason === "window-close" || scope.windowId !== undefined) return;
          for (const { session } of affected) unregisterContentSession(session);
        },
        rollback,
      };
    } catch (failure) {
      rollback();
      throw failure;
    }
  }

  private releaseReplacedSession(session: RuntimeSession, reason = "资料库或正文身份已变化") {
    const id = session.info.id;
    // 先保全原始材料，磁盘失败时保留仍可重试的旧会话和视图。
    if (session.dirty || session.cacheWriteFailed) this.store.compact(id, session.doc);
    this.store.discard(id, reason);
    for (const [viewId, view] of this.views) if (view.documentId === id) this.removeView(viewId);
    unregisterContentSession(session);
    session.awareness.destroy();
    session.doc.destroy();
    this.sessions.delete(id);
    this.frozenForDownload.delete(session);
    this.contentState?.db.prepare("DELETE FROM entity_holds WHERE holder=?").run(`document:${id}`);
    this.assets.removeDocumentCache(id);
    this.broadcast("collaboration:removed", { documentId: id, replaced: true });
  }

  /**
   * 整库被同步下载替换：本库正文缓存对应的是旧库。内存会话与磁盘冷缓存一并释放——
   * 冷缓存从未参与关库写回，留着会在下次打开时拿旧库内容覆盖新库。
   * 调用前 close-database 已把内存会话写回旧库，旧库也已复制进 backup/。
   */
  releaseLibrary(name: string): void {
    const workspace = name.replace(/\.db$/, "");
    const names = [workspace, `${workspace}.db`] as const;
    this.store.db.transaction(() => {
      const inputs = this.store.db
        .prepare("SELECT * FROM input_drafts WHERE workspace_id IN (?,?)")
        .all(...names) as { view_id: string; node_id: string; field: string; applied: number }[];
      const documents = this.store.db
        .prepare("SELECT * FROM document_drafts WHERE workspace_id IN (?,?) AND applied=0")
        .all(...names) as (Record<string, unknown> & { state: Buffer })[];
      const demotions = this.store.db
        .prepare(
          `SELECT key,value FROM settings WHERE key GLOB ? AND
           CASE WHEN json_valid(value) THEN json_extract(value, '$.info.source.databaseName') END IN (?,?)`
        )
        .all(contentDemotionKey("*"), ...names) as { key: string; value: string }[];
      const readBase = this.store.db.prepare("SELECT value FROM settings WHERE key=?");
      const pending = inputs
        .filter(row => !row.applied)
        .map(row => {
          const key = sourceDraftKey(row.view_id, row.node_id, row.field);
          const base = readBase.get(key) as { value: string } | undefined;
          return { ...row, base: base?.value };
        });
      if (pending.length || documents.length || demotions.length) {
        const directory = join(dirname(this.store.db.name), "discarded");
        mkdirSync(directory, { recursive: true, mode: 0o700 });
        writeFileSync(
          join(directory, `${Date.now()}-${randomUUID()}-drafts.json`),
          JSON.stringify({
            workspace,
            inputDrafts: pending,
            documentDrafts: documents.map(({ state, ...row }) => ({
              ...row,
              state: state.toString("base64"),
            })),
            ...(demotions.length ? { demotions } : {}),
          }),
          { mode: 0o600, flush: true }
        );
      }
      for (const row of inputs)
        this.store.delete(sourceDraftKey(row.view_id, row.node_id, row.field));
      for (const { key } of demotions) this.store.delete(key);
      for (const table of [
        "input_drafts",
        "document_drafts",
        "node_views",
        "entity_holds",
        "migrations",
      ])
        this.store.db.prepare(`DELETE FROM ${table} WHERE workspace_id IN (?,?)`).run(...names);
    })();
    const candidates = new Map(this.store.list().map(info => [info.id, info]));
    for (const session of this.sessions.values()) candidates.set(session.info.id, session.info);
    for (const info of candidates.values()) {
      if (info.mode !== "local" || info.source?.databaseName.replace(/\.db$/, "") !== workspace)
        continue;
      const session = this.sessions.get(info.id);
      if (session) this.releaseReplacedSession(session);
      else this.store.discard(info.id, "资料库已被下载替换");
    }
    this.changed();
  }

  startAutoFlush() {
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
      this.sharedEffects?.flushResources();
    }, 1000);
    this.autoFlushInterval.unref();
  }

  removeView(viewId: string) {
    const view = this.views.get(viewId);
    if (!view) return;
    this.acknowledgeFreeze(viewId, this.freezeWaiters.get(view.documentId)?.id);
    this.views.delete(viewId);
    const awareness = this.sessions.get(view.documentId)?.awareness;
    if (awareness) removeAwarenessStates(awareness, view.clientIds, "view-closed");
    const session = this.sessions.get(view.documentId);
    if (session?.info.mode !== "local") return;
    const closure = {};
    this.idleClosures.set(session, closure);
    const idle = () =>
      this.idleClosures.get(session) === closure &&
      this.sessions.get(session.info.id) === session &&
      !session.info.frozen &&
      ![...this.views.values()].some(entry => entry.documentId === session.info.id);
    setTimeout(() => {
      if (!idle()) return;
      void this.project(session)
        .then(() => {
          if (
            idle() &&
            !session.projectionDirty &&
            !this.contentState?.hasPendingDrafts(session.info.id) &&
            session.info.source &&
            databaseModule.getDatabase(session.info.source.databaseName)?.open
          )
            return this.removeSession(session);
        })
        .catch(error => {
          if (this.sessions.get(session.info.id) !== session) return;
          session.info.error = String(error);
          this.changed(session);
        });
    }, 250).unref();
  }
}
