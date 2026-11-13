import { app, BrowserWindow, type IpcMainInvokeEvent } from "electron";
import * as Y from "yjs";
import { Awareness, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import { randomUUID } from "node:crypto";
import { basename, join } from "node:path";
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
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import PathUtil from "../../utils/PathUtil";
import databaseModule from "../database";
import ContentTable from "../tables/content";
import { ContentDocumentTable } from "../tables/content-document";
import { ContentIdentityTable } from "../tables/content-identity";
import { repairContentForOpen } from "../content-repair";
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
import { CollaborationLocalStore } from "../collaboration/local-store";
import { CollaborationAssetService } from "../collaboration/asset-service";
import { ContentLocalState } from "../collaboration/content-local-state";
import { NodeSessionUpdates } from "../collaboration/node-session-updates";
import { ContentRetention } from "../collaboration/content-retention";
import { localSessionId } from "../collaboration/session-identity";
import { restoreContentBinding } from "../collaboration/content-repository";
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
  projectContentBlocks,
  projectContentTitle,
  projectContractContent,
  readContentProjectionHead,
  registerContentSession,
  unregisterContentSession,
} from "../collaboration/content-sessions";
import { registerLocalContentIpc } from "./ipc";
import { ContentAgent } from "./agent";
import type { ScopedWriteOptions } from "./agent/suggestion-service";
import { prepareContentAgentStore } from "./agent/store";
import { importLegacyContent, recoverContentDrafts } from "./recovery";

export type ContentDatabase = { db: Database.Database; name: string };
type ContentEvent = IpcMainInvokeEvent | ContentDatabase;

/** 正文会话持有本机耐久日志。共享运行时只在已绑定正文上接管会话。 */
export class ContentSessionManager {
  protected store!: CollaborationLocalStore;
  protected assets!: CollaborationAssetService;
  protected contentState?: ContentLocalState;
  protected directory = "";
  protected sessions = new Map<string, RuntimeSession>();
  protected views = new Map<string, CollaborationView>();
  protected projecting = new Map<string, Promise<void>>();
  protected nodeUpdates?: NodeSessionUpdates;
  protected stopContentRetention?: () => void;
  protected stopDocumentDrain?: () => void;
  protected freezeWaiters = new Map<string, { id: string; resolve(): void }>();
  protected closingWindows = new Set<number>();
  protected autoFlushInterval: ReturnType<typeof setInterval> | null = null;

  private contentAgent?: ContentAgent;
  private opening = new WeakMap<Database.Database, Map<number, Promise<ContentSessionSnapshot>>>();
  private sharing?: {
    open(event: ContentEvent, target: ContentSessionTarget): Promise<ContentSessionSnapshot>;
    find(id: string): RuntimeSession | undefined;
    findContent(workspaceId: string, contentId: number): RuntimeSession | undefined;
    readAgentState: ContentSessionManager["readSharedAgentState"];
    submitAgentEdit: ContentSessionManager["submitSharedAgentEdit"];
    broadcastPresence(documentId: string, update: Uint8Array): void;
    windows(id: number): void;
  };

  connectSharing(sharing: NonNullable<ContentSessionManager["sharing"]>) {
    this.sharing = sharing;
  }

  disconnectSharing() {
    this.sharing = undefined;
  }

  protected async openSharedContent(event: ContentEvent, target: ContentSessionTarget) {
    if (!this.sharing) {
      const { default: modules } = await import("../../module-init/ModuleInitManager");
      const ready = await modules.initModule("collaboration");
      if (!ready.success) throw new Error("COLLABORATION_UNAVAILABLE: " + ready.error);
    }
    if (!this.sharing) throw new Error("COLLABORATION_UNAVAILABLE: 共享服务尚未就绪");
    return this.sharing.open(event, target);
  }

  protected agentOwner(): ContentSessionManager {
    return this;
  }

  get agent(): ContentAgent {
    const owner = this.agentOwner();
    if (owner !== this) return owner.agent;
    if (!this.store) throw new Error("本机正文尚未就绪");
    return (this.contentAgent ??= new ContentAgent(
      this.store.db,
      this,
      (workspaceId, contentId) =>
        this.findContent(workspaceId, contentId) ??
        this.sharing?.findContent(workspaceId, contentId),
      (documentId, update) => {
        this.broadcast("collaboration:awareness", { documentId, update });
        this.sharing?.broadcastPresence(documentId, update);
      },
      this.readSharedAgentState.bind(this),
      this.submitSharedAgentEdit.bind(this)
    ));
  }

  protected async readSharedAgentState(session: RuntimeSession): Promise<Uint8Array> {
    if (!this.sharing) throw new Error("COLLABORATION_UNAVAILABLE: 共享服务尚未就绪");
    return this.sharing.readAgentState(session);
  }

  protected async submitSharedAgentEdit(
    session: RuntimeSession,
    request: ScopedContentSubmission,
    updateHash: string,
    check: () => void,
    options: ScopedWriteOptions
  ): Promise<import("@tau/collaboration").ScopedContentResult> {
    if (!this.sharing) throw new Error("COLLABORATION_UNAVAILABLE: 共享服务尚未就绪");
    return this.sharing.submitAgentEdit(session, request, updateHash, check, options);
  }

  protected attach(_session: RuntimeSession) {}
  protected broadcastSharedState() {}
  protected flushSessionResources() {}
  protected async preserveOwnerImages(_session: RuntimeSession): Promise<void> {}
  protected async confirmSharedReplacement(
    _session: RuntimeSession,
    _identity: { documentId: string; baselineId: string; epoch: number },
    _revision: string,
    _update: Uint8Array,
    _operationId: string,
    _check: () => void
  ): Promise<void> {}
  private scheduleSuggestionValidation(
    workspaceId: string,
    contentId: number,
    document: () => Y.Doc | undefined
  ) {
    try {
      this.agent.suggestions.scheduleValidation(workspaceId, contentId, document);
    } catch (error) {
      console.warn(
        "[local-content] 正文建议校验未调度",
        error instanceof Error ? error.name : "Error"
      );
    }
  }

  async open(event: ContentEvent, target: ContentSessionTarget) {
    const { db } = this.databaseForEvent(event);
    const id = target.contentId;
    const requests = this.opening.get(db) ?? new Map<number, Promise<ContentSessionSnapshot>>();
    this.opening.set(db, requests);
    let request = requests.get(id);
    if (!request) {
      request = this.openContent(event, target).finally(() => requests.delete(id));
      requests.set(id, request);
    }
    const snapshot = await request;
    if (this.databaseForEvent(event).db !== db) throw new Error("资料库已切换，请重新打开内容");
    return snapshot;
  }

  openForDatabase(db: Database.Database, contentId: number) {
    const name = [...databaseModule.databases].find(([, connection]) => connection === db)?.[0];
    if (!name) throw new Error("资料库连接已变化，请重新打开正文");
    return this.open({ db, name }, { contentId });
  }

  resumeLocalOpen(event: ContentEvent, target: ContentSessionTarget) {
    return this.openContent(event, target);
  }

  /** 发起共享先排空本机视图，再由共享方接管。 */
  install(info: CollaborationSession, doc: Y.Doc) {
    this.store.create(info, doc);
    return this.restore(info, doc);
  }
  discardCache(id: string, reason: string) {
    this.store.discard(id, reason);
  }
  getSession(id: string) {
    return this.requireSession(id);
  }
  find(id: string) {
    return this.findSession(id);
  }
  async prepareShare(session: RuntimeSession) {
    await this.freeze(session);
  }
  pendingShare<T>(id: string): T | null {
    return this.store.get<T | null>(`publishing:${id}`, null);
  }
  rememberShare(id: string, value: unknown): void {
    this.store.set(`publishing:${id}`, value);
  }
  clearPendingShare(id: string): void {
    this.store.delete(`publishing:${id}`);
  }
  cancelShare(session: RuntimeSession) {
    this.unfreeze(session);
  }
  save(session: RuntimeSession) {
    return this.project(session);
  }
  finishShare(session: RuntimeSession) {
    return this.removeSession(session);
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

  async init() {
    const appDirectory = PathUtil.getAppDir();
    this.directory = join(appDirectory, "local-content");
    this.store = new CollaborationLocalStore(this.directory, "content.db");
    this.contentState = new ContentLocalState(this.store.db);
    importLegacyContent(appDirectory, this.store);
    prepareContentAgentStore(appDirectory, this.store);
    this.assets = new CollaborationAssetService(this.store, appDirectory, async () => {
      throw new Error("本机正文资源无需远端身份");
    });
    this.initDurability();
    registerLocalContentIpc({
      nodeUpdates: this.contentUpdates(),
      store: this.store,
      contentState: this.contentState,
      assets: this.assets,
      views: this.views,
      openContent: this.open.bind(this),
      findSession: id => this.findSession(id) ?? this.sharing?.find(id),
      requireSession: this.requireSession.bind(this),
      databaseForEvent: this.databaseForEvent.bind(this),
      changed: this.changed.bind(this),
      removeView: this.removeView.bind(this),
      acknowledgeFreeze: this.acknowledgeFreeze.bind(this),
      presenceSnapshot: session => this.agent.presenceSnapshot(session),
      user: () => ({ id: this.store.get("localDeviceId", "local"), nickname: "本机" }),
    });
    for (const window of BrowserWindow.getAllWindows()) this.registerWindow(window);
    app.on("browser-window-created", (_event, window) => this.registerWindow(window));
    this.startAutoFlush();
  }

  protected initDurability() {
    const state = this.contentState!;
    const retention = new ContentRetention(state);
    this.stopContentRetention = registerDurableEntityHolds((db, kind, id) => {
      const workspaceId = [...databaseModule.databases].find(([, value]) => value === db)?.[0];
      return (
        workspaceId === undefined ||
        (this === localContent &&
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
        (!scope.databaseName || session.info.source?.databaseName === scope.databaseName) &&
        (scope.windowId === undefined ||
          [...this.views.values()].some(
            view => view.documentId === session.info.id && view.windowId === scope.windowId
          ))
    );
  }

  protected hasViews(scope: DocumentDrainScope) {
    return this.sessionsForDrain(scope).length > 0;
  }

  shutdown(): void {
    this.contentAgent?.dispose();
    this.contentAgent = undefined;
    if (this.autoFlushInterval) clearInterval(this.autoFlushInterval);
    this.stopContentRetention?.();
    this.stopContentRetention = undefined;
    this.stopDocumentDrain?.();
    this.stopDocumentDrain = undefined;
  }

  protected broadcast(channel: string, value: unknown) {
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
  protected changed(session?: RuntimeSession) {
    if (session) this.store.metadata(session.info);
    if (session?.info.mode === "local") {
      this.broadcast("collaboration:session-error", {
        documentId: session.info.id,
        error: session.info.error,
      });
      return;
    }
    this.broadcastSharedState();
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
        frozen: Boolean(this.pendingShare(info.id)),
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
          this.scheduleSuggestionValidation(
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
      this.scheduleSuggestionValidation(
        source.databaseName.replace(/\.db$/, ""),
        source.contentId,
        () => (this.sessions.get(session.info.id) === session ? session.doc : undefined)
      );
    this.attach(session);
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
  protected loadCached(id: string, info?: CollaborationSession): RuntimeSession | undefined {
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
  protected requireSession(id: string): RuntimeSession {
    const session = this.findSession(id);
    if (!session || session.info.leaving) throw new Error("正文会话已失效，请重新打开");
    return session;
  }

  protected async openContent(
    event: IpcMainInvokeEvent | { db: import("better-sqlite3").Database; name: string },
    target: ContentSessionTarget
  ): Promise<ContentSessionSnapshot> {
    const { db, name } = this.databaseForEvent(event);
    if (target.sourceType && !SOURCE_TYPES.includes(target.sourceType))
      throw new Error("不支持的内容来源，请升级客户端");
    if (!Number.isSafeInteger(target.contentId) || target.contentId <= 0)
      throw new Error("内容 ID 不合法");
    // 协作中的正文以会话为准，不按主库修复
    if (findCollaborationBinding(db, target.contentId))
      return this.openSharedContent(event, target);
    await repairContentForOpen(
      db,
      name,
      target.contentId,
      () => databaseModule.getDatabase(name) === db
    );
    const content = ContentTable.getContentById(db, target.contentId);
    if (!content) throw new Error("内容不存在");
    if (findCollaborationBinding(db, target.contentId))
      return this.openSharedContent(event, target);
    const id = localSessionId(db.name, content.id, content.createTime);
    let session = this.findSession(id);
    const recoverySource = session?.info.source;
    const head =
      session && recoverySource
        ? (db
            .prepare(
              "SELECT document_id AS documentId,revision FROM content_documents WHERE content_id=?"
            )
            .get(content.id) as { documentId: string; revision: string } | undefined)
        : undefined;
    if (
      session?.info.mode === "local" &&
      this.contentState &&
      recoverySource &&
      head &&
      ![...this.views.values()].some(view => view.documentId === id) &&
      recoverySource.librarySourceId === ContentIdentityTable.library(db)?.sourceId &&
      recoverySource.contentDocumentId === head.documentId &&
      recoverySource.projectionRevision === head.revision
    )
      await recoverContentDrafts(
        this.store,
        this.contentState,
        session.info,
        session.doc,
        () =>
          db.open &&
          databaseModule.getDatabase(name) === db &&
          !findCollaborationBinding(db, content.id) &&
          this.databaseForEvent(event).db === db &&
          contentSession(db, content.id) === session &&
          (
            db
              .prepare("SELECT revision FROM content_documents WHERE content_id=?")
              .get(content.id) as { revision: string } | undefined
          )?.revision === recoverySource.projectionRevision
      );
    if (
      !db.open ||
      databaseModule.getDatabase(name) !== db ||
      ("sender" in event && this.databaseForEvent(event).db !== db)
    )
      throw new Error("资料库已切换，请重新打开内容");
    if (findCollaborationBinding(db, target.contentId))
      return this.openSharedContent(event, target);
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
      if (
        !db.open ||
        databaseModule.getDatabase(name) !== db ||
        ("sender" in event && this.databaseForEvent(event).db !== db)
      ) {
        doc.destroy();
        throw new Error("资料库已切换，请重新打开内容");
      }
      if (findCollaborationBinding(db, target.contentId)) {
        doc.destroy();
        return this.openSharedContent(event, target);
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

  protected acknowledgeFreeze(viewId: string, requestId?: string) {
    const view = this.views.get(viewId);
    const session = view && this.sessions.get(view.documentId);
    const waiter = session && this.freezeWaiters.get(session.info.id);
    if (waiter ? waiter.id !== requestId : requestId !== undefined) return;
    if (!session?.drainingViews) return;
    session.drainingViews.delete(viewId);
    if (!session.drainingViews.size) waiter?.resolve();
  }

  protected async freeze(session: RuntimeSession) {
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
    for (const [id, view] of this.views) if (view.windowId === windowId) this.removeView(id);
  }

  protected registerWindow(window: BrowserWindow) {
    window.webContents.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace) {
        this.removeWindowViews(window.id);
        this.sharing?.windows(window.id);
      }
    });
    window.webContents.on("render-process-gone", () => {
      this.removeWindowViews(window.id);
      this.sharing?.windows(window.id);
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
      this.sharing?.windows(window.id);
    });
  }

  protected unfreeze(session: RuntimeSession) {
    session.info.frozen = false;
    session.drainingViews = undefined;
    this.broadcast("collaboration:freeze", { documentId: session.info.id, frozen: false });
  }

  protected databaseForEvent(
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
  protected findLocalSource(documentId: string, serverUrl: string) {
    for (const [name, db] of databaseModule.databases) {
      if (!db.open) continue;
      const source = restoreContentBinding(db, name, documentId, serverUrl);
      if (source) return source;
    }
  }
  protected contentUpdates() {
    return (this.nodeUpdates ??= new NodeSessionUpdates(this.store, this.contentState));
  }

  protected async replaceContentSnapshot(
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
      await this.confirmSharedReplacement(
        session,
        identity,
        expectedRevision!,
        update,
        operationId,
        check
      );
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

  protected project(session: RuntimeSession): Promise<void> {
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

  protected async removeSession(session: RuntimeSession) {
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
  protected async drainDatabase(scope: DocumentDrainScope): Promise<DocumentDrain> {
    const affected = this.sessionsForDrain(scope);
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
          if (scope.reason === "window-close") return;
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
  protected readonly replacementReleases = new Map<string, Promise<void>>();

  /** 本地会话备份后丢弃，共享会话解除来源；同一会话并发释放只执行一次。 */
  protected releaseReplacedSession(
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
    for (const table of ["node_views", "entity_holds", "migrations"])
      this.store.db
        .prepare(`DELETE FROM ${table} WHERE workspace_id IN (?,?)`)
        .run(name, name.endsWith(".db") ? name.slice(0, -3) : `${name}.db`);
    this.changed();
  }

  protected startAutoFlush() {
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
      this.flushSessionResources();
    }, 1000);
    this.autoFlushInterval.unref();
  }

  protected removeView(viewId: string) {
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
              !this.contentState?.hasPendingDrafts(session.info.id) &&
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

const localContent = new ContentSessionManager();
export default localContent;
