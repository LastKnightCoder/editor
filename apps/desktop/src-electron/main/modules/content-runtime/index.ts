import { app, BrowserWindow, type Event, type IpcMainInvokeEvent } from "electron";
import type * as Y from "yjs";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type {
  CollaborationSession,
  ContentNode,
  ContentSessionSnapshot,
  ContentSessionTarget,
  ScopedContentSubmission,
  SourceBinding,
} from "@tau/collaboration";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import databaseModule from "../database";
import { restoreContentBinding } from "../collaboration/content-repository";
import {
  hasDurableDocuments,
  prepareDurableDocuments,
  registerDurableDocuments,
  type DocumentDrain,
  type DocumentDrainScope,
} from "../durable-document-lifecycle";
import { registerDurableEntityHolds } from "../durable-entity-holds";
import type { CollaborationLocalStore } from "../collaboration/local-store";
import type { CollaborationAssetService } from "../collaboration/asset-service";
import type { ContentLocalState } from "../collaboration/content-local-state";
import type { NodeSessionUpdates } from "../collaboration/node-session-updates";
import type { ContentRetention } from "../collaboration/content-retention";
import { contentSession } from "../collaboration/content-sessions";
import { reportContentSaveIssue } from "../collaboration/persistence-diagnostics";
import type { RuntimeSession, CollaborationView } from "../collaboration/types";
import { registerLocalContentIpc } from "./ipc";
import type { ContentAgent, ContentAgentHost } from "./agent";
import type { ScopedWriteOptions } from "./agent/suggestion-service";
import type { ContentProjectionStore } from "./content-projection";
import { ContentSessionLifecycle } from "./content-session-lifecycle";
import type { LocalContentSource } from "./local-content-source";
import { acknowledgeFreeze, freeze, unfreeze } from "./freeze";
import { drainDatabase, hasViews, prepareSessionDrain, sessionsForDrain } from "./drain";
import { beginOpen, open, openContent, openForDatabase, resumeLocalOpen } from "./open";
import { project, projectSession } from "./content-projection";
import { replaceContentSnapshot } from "./replacement";
import {
  discardRemoteSession,
  releaseLibrary,
  releaseReplacedSession,
  removeSession,
  removeStoredSession,
  removeView,
  removeWindowViews,
} from "./removal";
import { findContent, findSession, loadCached, restore, retainNodeState } from "./sessions";
import {
  connectSharing,
  finishPublishedShare,
  install,
  openSharedContent,
  readSharedAgentState,
  restoreDemotion,
  stageDemotion,
  submitSharedAgentEdit,
} from "./sharing";
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
  sessions = new Map<string, RuntimeSession>();

  views = new Map<string, CollaborationView>();

  projecting = new Map<RuntimeSession, Promise<void>>();

  protected stopContentRetention?: () => void;

  protected stopDocumentDrain?: () => void;

  private stopDatabaseReconnect?: () => void;

  private stopLocalIpc?: () => void;

  private stopWindowRegistration?: () => void;

  readonly frozenForDownload = new Set<RuntimeSession>();

  freezeWaiters = new Map<string, { id: string; resolve(): void }>();

  protected closingWindows = new Set<number>();

  protected autoFlushInterval: ReturnType<typeof setInterval> | null = null;

  private contentAgent?: ContentAgent;

  readonly lifecycle = new ContentSessionLifecycle();

  readonly draining = new Set<RuntimeSession>();

  readonly idleClosures = new WeakMap<RuntimeSession, object>();

  sharing?: SharedContentBridge;

  constructor(
    readonly storage: ContentRuntimeStorage,
    private readonly host:
      | { createAgent(host: ContentAgentHost): ContentAgent }
      | SharedSessionEffects
  ) {}

  get sharedEffects() {
    return "createAgent" in this.host ? undefined : this.host;
  }

  get store() {
    return this.storage.store;
  }

  get assets() {
    return this.storage.assets;
  }

  get contentState() {
    return this.storage.contentState;
  }

  connectSharing(sharing: SharedContentBridge) {
    return connectSharing(this, sharing);
  }

  async openSharedContent(
    event: ContentOpenContext,
    target: ContentSessionTarget,
    check: () => void
  ) {
    return openSharedContent(this, event, target, check);
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
    return readSharedAgentState(this, session);
  }

  private async submitSharedAgentEdit(
    session: RuntimeSession,
    request: ScopedContentSubmission,
    updateHash: string,
    check: () => void,
    options: ScopedWriteOptions
  ): Promise<import("@tau/collaboration").ScopedContentResult> {
    return submitSharedAgentEdit(this, session, request, updateHash, check, options);
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
    return open(this, event, target);
  }

  openForDatabase(db: Database.Database, contentId: number) {
    return openForDatabase(this, db, contentId);
  }

  resumeLocalOpen(event: ContentOpenContext, target: ContentSessionTarget, check: () => void) {
    return resumeLocalOpen(this, event, target, check);
  }

  beginOpen(event: ContentOpenContext, target: ContentSessionTarget, parentCheck?: () => void) {
    return beginOpen(this, event, target, parentCheck);
  }

  /** 发起共享先排空本机视图，再由共享方接管。 */
  install(info: CollaborationSession, doc: Y.Doc) {
    return install(this, info, doc);
  }

  stageDemotion(info: CollaborationSession, doc: Y.Doc) {
    return stageDemotion(this, info, doc);
  }

  restoreDemotion({ db, name }: ContentDatabase, id: string): RuntimeSession | undefined {
    return restoreDemotion(this, { db, name }, id);
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
    return finishPublishedShare(this, id, source, published);
  }

  findContent(workspaceId: string, contentId: number) {
    return findContent(this, workspaceId, contentId);
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

  sessionsForDrain(scope: DocumentDrainScope) {
    return sessionsForDrain(this, scope);
  }

  protected hasViews(scope: DocumentDrainScope) {
    return hasViews(this, scope);
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

  restore(info: CollaborationSession, doc: Y.Doc) {
    return restore(this, info, doc);
  }

  retainNodeState(session: RuntimeSession, doc: Y.Doc) {
    return retainNodeState(this, session, doc);
  }

  findSession(id: string): RuntimeSession | undefined {
    return findSession(this, id);
  }

  /** 恢复冷缓存；打不开的缓存备份后丢弃并返回 undefined，由调用方按远端或主库重建。 */
  loadCached(
    id: string,
    info?: CollaborationSession,
    check?: (info: CollaborationSession) => void
  ): RuntimeSession | undefined {
    return loadCached(this, id, info, check);
  }

  requireSession(id: string): RuntimeSession {
    const session = this.findSession(id);
    if (!session || session.info.leaving) throw new Error("正文会话已失效，请重新打开");
    return session;
  }

  async openContent(
    event: ContentOpenContext,
    target: ContentSessionTarget,
    { db, name }: ContentDatabase,
    check: () => void
  ): Promise<ContentSessionSnapshot> {
    return openContent(this, event, target, { db, name }, check);
  }

  acknowledgeFreeze(viewId: string, requestId?: string) {
    return acknowledgeFreeze(this, viewId, requestId);
  }

  async freeze(session: RuntimeSession) {
    return freeze(this, session);
  }

  removeWindowViews(windowId: number) {
    return removeWindowViews(this, windowId);
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
    return unfreeze(this, session);
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

  async replaceContentSnapshot(
    session: RuntimeSession,
    content: ContentNode[],
    supplied: ContentContractDictionary | undefined,
    expectedRevision: string | undefined,
    checkScope?: () => void,
    onAccepted?: () => void
  ): Promise<void> {
    return replaceContentSnapshot(
      this,
      session,
      content,
      supplied,
      expectedRevision,
      checkScope,
      onAccepted
    );
  }

  project(session: RuntimeSession): Promise<void> {
    return project(this, session);
  }

  async projectSession(session: RuntimeSession) {
    return projectSession(this, session);
  }

  removeStoredSession(id: string, onRemove?: () => void) {
    return removeStoredSession(this, id, onRemove);
  }

  async removeSession(session: RuntimeSession, onRemove?: () => void) {
    return removeSession(this, session, onRemove);
  }

  discardRemoteSession(session: RuntimeSession, reason: string) {
    return discardRemoteSession(this, session, reason);
  }

  protected drainDatabase(scope: DocumentDrainScope): Promise<DocumentDrain> {
    return drainDatabase(this, scope);
  }

  async prepareSessionDrain(scope: DocumentDrainScope): Promise<DocumentDrain> {
    return prepareSessionDrain(this, scope);
  }

  releaseReplacedSession(session: RuntimeSession, reason = "资料库或正文身份已变化") {
    return releaseReplacedSession(this, session, reason);
  }

  /**
   * 整库被同步下载替换：本库正文缓存对应的是旧库。内存会话与磁盘冷缓存一并释放——
   * 冷缓存从未参与关库写回，留着会在下次打开时拿旧库内容覆盖新库。
   * 调用前 close-database 已把内存会话写回旧库，旧库也已复制进 backup/。
   */
  releaseLibrary(name: string): void {
    return releaseLibrary(this, name);
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
    return removeView(this, viewId);
  }
}
