import { WhiteboardTransitions } from "./transitions";
import { WhiteboardInstallation } from "./installation";
import { CollaborationAssetService } from "../collaboration/asset-service";
import { CollaborationLocalStore } from "../collaboration/local-store";
import { ContentLocalState } from "../collaboration/content-local-state";
import { openWhiteboardState } from "./local-state";
import { CONTENT_RELEASE_GRACE_MS } from "../tables/content";
import * as Y from "yjs";
import {
  normalizeServerUrl,
  DocumentWriteQueue,
  WHITEBOARD_DOCUMENT_VERSION,
  type DocumentSyncSession,
} from "@tau/collaboration";
import collaborationModule from "../collaboration";
import { openWhiteboardRemoteSession } from "./remote";
import { WhiteboardRealtime } from "./realtime";
import DataTableTable from "../tables/data-table";
import WhiteboardContentTable from "../tables/white-board-content";
import { app, BrowserWindow, type IpcMainInvokeEvent } from "electron";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import databaseModule from "../database";
import PathUtil from "../../utils/PathUtil";
import { ContentIdentityTable } from "../tables/content-identity";
import { WhiteboardJournal, stateHash } from "./journal";
import { WhiteboardDocumentSessions } from "./sessions";
import { WhiteboardDocumentRepository } from "./repository";
import { registerDurableDocuments, type DocumentDrainScope } from "../durable-document-lifecycle";
import { hasDurableEntityHold, registerDurableEntityHolds } from "../durable-entity-holds";
import type Database from "better-sqlite3";
import {
  prepareUnshareCandidate,
  type WhiteboardUnshareJob,
  type WhiteboardUnshareMode,
} from "./unshare";
import { registerWhiteboardDocumentIpc } from "./ipc";
type WhiteboardDrainScope = DocumentDrainScope & { documentId?: string };
/** 排空时窗口未及回执（不可达、超时、被并发操作取消）；会话本身完好，稍后重试即可。 */
class DrainInterrupted extends Error {}
export class WhiteboardDocumentsModule {
  async remoteClient() {
    const { default: modules } = await import("../../module-init/ModuleInitManager");
    const ready = await modules.initModule("collaboration");
    if (!ready.success)
      throw new Error(`COLLABORATION_UNAVAILABLE: ${ready.error ?? "共享服务尚未就绪"}`);
    return collaborationModule.documentClient();
  }

  installation!: WhiteboardInstallation;
  transitions!: WhiteboardTransitions;
  transitionPreparing = new Map<string, Promise<void>>();
  transitionOwners = new Map<string, string>();
  transitionDrains = new Map<string, Awaited<ReturnType<WhiteboardDocumentsModule["drain"]>>>();
  name = "whiteboard-documents";
  sessions!: WhiteboardDocumentSessions;
  remote = new Map<string, Promise<DocumentSyncSession>>();
  remoteViews = new Map<string, { key: string; rejectedCount: number }>();
  private remoteSyncs = new Map<string, Promise<unknown>>();
  private remoteUsers = new Map<string, number>();
  realtime = new Map<string, WhiteboardRealtime>();
  private evictRemote(key: string) {
    if (
      this.remoteUsers.has(key) ||
      this.remoteSyncs.has(key) ||
      [...this.remoteViews.values()].some(view => view.key === key)
    )
      return;
    this.remote.delete(key);
  }
  stopRealtime(key: string) {
    for (const [leaseId, view] of this.remoteViews) {
      if (view.key !== key) continue;
      this.realtime.get(leaseId)?.dispose();
      this.realtime.delete(leaseId);
    }
  }
  releaseRemoteView(leaseId: string) {
    this.realtime.get(leaseId)?.dispose();
    this.realtime.delete(leaseId);
    const view = this.remoteViews.get(leaseId);
    this.remoteViews.delete(leaseId);
    if (view) this.evictRemote(view.key);
  }
  private journal!: WhiteboardJournal;
  /** 页读取前自愈；模块尚未初始化（启动早期、测试）时不处理 */
  async healPage(databaseName: string, contentId: number): Promise<void> {
    await this.sessions?.healPage(databaseName, contentId);
  }
  private store!: CollaborationLocalStore;
  assets!: CollaborationAssetService;
  unshareQueue = new DocumentWriteQueue(16 * 1024 * 1024);
  pendingUnshare(name: string, documentId: string) {
    return this.store.get<WhiteboardUnshareJob | null>(
      `whiteboard-unshare:${name}:${documentId}`,
      null
    );
  }
  hasSharedBaseline(db: Database.Database, name: string, documentId: string): boolean {
    const current = new WhiteboardDocumentRepository(db, name).read(documentId);
    if (!current) return false;
    const doc = new Y.Doc();
    try {
      Y.applyUpdate(doc, current.state);
      return (
        doc.share.has("meta") && doc.getMap("meta").get("version") === WHITEBOARD_DOCUMENT_VERSION
      );
    } finally {
      doc.destroy();
    }
  }
  blocked(name: string, documentId: string) {
    return (
      this.transitions.blocked(name, documentId) || Boolean(this.pendingUnshare(name, documentId))
    );
  }
  private assertOwnerDeletion(db: Database.Database, id: number): string {
    const name = [...databaseModule.databases].find(([, value]) => value === db)?.[0];
    if (name === undefined || !this.sessions || !this.store)
      throw new Error("白板文档服务尚未就绪");
    const row = db
      .prepare("SELECT document_id FROM whiteboard_documents WHERE board_id=?")
      .get(id) as { document_id: string } | undefined;
    if (!row) return "";
    if (
      this.store.get(`whiteboard-binding:${name}:${row.document_id}`, null) ||
      (!this.store.get("legacy-whiteboard-state-imported", false) &&
        this.hasSharedBaseline(db, name, row.document_id))
    )
      throw new Error("请先结束共享或退出协作，再删除本机白板");
    if (this.blocked(name, row.document_id)) throw new Error("白板仍有未完成转换，不能删除");
    return row.document_id;
  }
  async deleteBoard(
    db: Database.Database,
    id: number,
    remove?: () => void
  ): Promise<number | void> {
    const name = [...databaseModule.databases].find(([, value]) => value === db)?.[0];
    const row = db
      .prepare("SELECT document_id FROM whiteboard_documents WHERE board_id=?")
      .get(id) as { document_id: string } | undefined;
    const table = (await import("../tables/whiteboard")).default;
    if (!row) return remove ? db.transaction(remove)() : table.deleteWhiteboard(db, id);
    if (name === undefined || !this.sessions) throw new Error("白板文档服务尚未就绪");
    if (
      this.store.get(`whiteboard-binding:${name}:${row.document_id}`, null) ||
      (!this.store.get("legacy-whiteboard-state-imported", false) &&
        this.hasSharedBaseline(db, name, row.document_id))
    )
      throw new Error("请先结束共享或退出协作，再删除本机白板");
    const drain = await this.drain({
      databaseName: name,
      documentId: row.document_id,
      reason: "database-change",
    });
    try {
      await this.sessions.flushDocument(name, row.document_id);
      if (databaseModule.getDatabase(name) !== db) throw new Error("删除期间资料库已变化");
      this.assertOwnerDeletion(db, id);
      const removed = db.transaction(() => {
        const visible = new Set(table.getWhiteboard(db, id).whiteboardContentIds);
        const pages = db
          .prepare("SELECT content_id FROM whiteboard_document_pages WHERE document_id=?")
          .all(row.document_id) as { content_id: number }[];
        db.prepare(
          "UPDATE whiteboard_documents SET board_id=NULL,board_created_at=NULL WHERE document_id=?"
        ).run(row.document_id);
        const result = remove ? remove() : table.deleteWhiteboard(db, id);
        for (const page of pages)
          if (!visible.has(page.content_id))
            WhiteboardContentTable.deleteWhiteboard(db, page.content_id);
        return result;
      })();
      drain.commit();
      return removed;
    } catch (error) {
      drain.rollback();
      throw error;
    }
  }
  /** 整库被同步下载替换：本机日志对应旧库，留着会让新库的白板判为分叉而无法打开。 */
  releaseLibrary(name: string): void {
    if (!this.sessions) return;
    const released = this.sessions.releaseLibrary(name);
    if (released)
      console.info(`[whiteboard-documents] 资料库 ${name} 被替换，释放 ${released} 份白板日志`);
  }
  collectPendingDocuments(db: Database.Database, now: number, graceMs: number): number {
    const name = [...databaseModule.databases].find(([, value]) => value === db)?.[0];
    if (name === undefined || !this.sessions || !this.store) return 0;
    let collected = 0;
    for (const { document_id } of db
      .prepare("SELECT document_id FROM whiteboard_documents WHERE board_id IS NULL")
      .all() as { document_id: string }[]) {
      if (
        this.sessions.isActive(name, document_id) ||
        this.blocked(name, document_id) ||
        this.store.get(`whiteboard-binding:${name}:${document_id}`, null) ||
        (!this.store.get("legacy-whiteboard-state-imported", false) &&
          this.hasSharedBaseline(db, name, document_id))
      )
        continue;
      const previousRoom = this.store.get<{ roomId: string } | null>(
        `whiteboard-unshare:${name}:${document_id}`,
        null
      );
      const rooms = new Set([
        document_id,
        ...(previousRoom ? [previousRoom.roomId] : []),
        ...this.transitions.publications.rooms(name, document_id),
      ]);
      if (
        this.journal.db.prepare("SELECT 1 FROM sqlite_master WHERE name='remote_branches'").get() &&
        [...rooms].some(room =>
          this.journal.db
            .prepare(
              "SELECT 1 FROM remote_branches WHERE json_extract(scope,'$[2]')=? AND (json_array_length(value,'$.pending')>0 OR json_array_length(value,'$.rejected')>0)"
            )
            .get(room)
        )
      )
        continue;
      const pages = db
        .prepare(
          "SELECT c.id,c.ref_count,r.released_at FROM whiteboard_document_pages p JOIN white_board_contents c ON c.id=p.content_id LEFT JOIN white_board_content_pending_releases r ON r.content_id=c.id WHERE p.document_id=?"
        )
        .all(document_id) as { id: number; ref_count: number; released_at: number | null }[];
      if (
        !pages.length ||
        pages.some(
          page =>
            page.ref_count > 0 || page.released_at === null || page.released_at > now - graceMs
        )
      )
        continue;
      const held = this.journal.holds(name, document_id);
      if (
        pages.some(
          page =>
            hasDurableEntityHold(db, "whiteboard-content", page.id, "content") ||
            held.some(
              ref =>
                ref.kind === "whiteboard-content" &&
                ContentIdentityTable.resolve(db, ref) === page.id
            )
        )
      )
        continue;
      this.sessions.retire(name, document_id);
      collected++;
    }
    return collected;
  }
  /** 已用确认快照重建本机副本时记录的被拒分支数。 */
  cleanRejected(key: string): number {
    return this.store.get<number>(`whiteboard-remote-clean:${key}`, 0);
  }
  /** 同一服务地址、设备身份与房间只建立一个网络会话，多窗口和多视图共用。 */
  async remoteSession(serverUrl: string, documentId: string) {
    const client = await this.remoteClient(),
      url = normalizeServerUrl(serverUrl),
      identity = await client.identity(url);
    const key = JSON.stringify([url, identity.id, documentId]);
    this.remoteUsers.set(key, (this.remoteUsers.get(key) ?? 0) + 1);
    const release = () => {
      const remaining = (this.remoteUsers.get(key) ?? 1) - 1;
      if (remaining) this.remoteUsers.set(key, remaining);
      else this.remoteUsers.delete(key);
      this.evictRemote(key);
    };
    let opening = this.remote.get(key);
    if (!opening) {
      opening = openWhiteboardRemoteSession(this.journal, client, url, documentId);
      this.remote.set(key, opening);
      void opening.catch(() => {
        if (this.remote.get(key) === opening) this.remote.delete(key);
      });
    }
    try {
      return { key, url, session: await opening, release };
    } catch (error) {
      release();
      throw error;
    }
  }
  /** 同一房间的同步串行执行，避免两个窗口把同一份本机差异重复提交。 */
  serialRemote<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.remoteSyncs.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    this.remoteSyncs.set(key, next);
    void next
      .catch(() => undefined)
      .finally(() => {
        if (this.remoteSyncs.get(key) === next) this.remoteSyncs.delete(key);
        this.evictRemote(key);
      });
    return next;
  }
  drains = new Set<WhiteboardDrainScope>();
  private preparing = new Set<{
    owner: number;
    databaseName: string;
    documentId: string;
    task: Promise<unknown>;
  }>();
  async prepareView<T>(
    owner: number,
    databaseName: string,
    documentId: string,
    task: Promise<T>
  ): Promise<T> {
    const entry = { owner, databaseName, documentId, task };
    this.preparing.add(entry);
    try {
      return await task;
    } finally {
      this.preparing.delete(entry);
    }
  }
  assertOpenAllowed(owner: number, databaseName: string, documentId?: string): void {
    if (
      [...this.drains].some(
        scope =>
          (scope.windowId === undefined || scope.windowId === owner) &&
          (!scope.databaseName || scope.databaseName === databaseName) &&
          (!scope.documentId || scope.documentId === documentId)
      )
    )
      throw new Error("白板正在关闭或切库，请稍后重试");
  }
  waiters = new Map<string, { owner: number; resolve: (error?: string) => void }>();
  owner(event: IpcMainInvokeEvent, databaseName?: string): number {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed() || event.sender.isDestroyed())
      throw new Error("白板窗口已关闭");
    if (databaseName && databaseModule.windowToDatabase.get(window.id) !== databaseName)
      throw new Error("白板请求来自旧资料库");
    return window.id;
  }
  leaseOwner(event: IpcMainInvokeEvent, leaseId: string): number {
    const owner = this.owner(event),
      view = this.sessions.holders({ owner }).find(view => view.leaseId === leaseId);
    if (!view) throw new Error("白板视图不属于此窗口");
    this.owner(event, view.databaseName);
    return owner;
  }

  async init(): Promise<void> {
    const journal = new WhiteboardJournal(
      join(PathUtil.getAppDir(), "whiteboard-documents", "journal.db")
    );
    this.journal = journal;
    const projected = (databaseName: string, documentId: string) => {
      for (const window of BrowserWindow.getAllWindows())
        if (!window.isDestroyed())
          window.webContents.send("whiteboard-document:projected", { databaseName, documentId });
    };
    this.sessions = new WhiteboardDocumentSessions(
      journal,
      name => databaseModule.getDatabase(name),
      (owner, event) => {
        const window = BrowserWindow.fromId(owner);
        if (window && !window.isDestroyed())
          window.webContents.send("whiteboard-document:update", event);
      },
      (db, kind, id, delta) => {
        if (kind === "data-table") {
          if (delta > 0) DataTableTable.incrementRefCount(db, id);
          else DataTableTable.remove(db, id);
        } else if (delta > 0) WhiteboardContentTable.incrementRefCount(db, id);
        else WhiteboardContentTable.deleteWhiteboard(db, id);
      },
      projected,
      (name, id) => this.blocked(name, id)
    );
    const { store, assets } = openWhiteboardState(PathUtil.getAppDir(), async url =>
      (await this.remoteClient()).identity(url)
    );
    this.store = store;
    this.assets = assets;
    this.installation = new WhiteboardInstallation(
      new ContentLocalState(store.db),
      journal,
      (db, kind, id, delta) => {
        if (kind === "data-table") {
          if (delta > 0) DataTableTable.incrementRefCount(db, id);
          else DataTableTable.remove(db, id);
        } else if (delta > 0) WhiteboardContentTable.incrementRefCount(db, id);
        else WhiteboardContentTable.deleteWhiteboard(db, id);
      },
      (db, name) => db.open && databaseModule.getDatabase(name) === db
    );
    this.transitions = new WhiteboardTransitions(
      this.installation,
      store,
      () => this.remoteClient(),
      this.assets
    );
    registerWhiteboardDocumentIpc(this, store, projected);
    registerDurableDocuments({
      has: scope =>
        this.views(scope).length > 0 ||
        [...this.preparing].some(
          entry =>
            (scope.windowId === undefined || scope.windowId === entry.owner) &&
            (!scope.databaseName || scope.databaseName === entry.databaseName)
        ),
      prepare: scope => this.drain(scope),
    });
    registerDurableEntityHolds((db, kind, localId) => {
      const name = [...databaseModule.databases].find(([, value]) => value === db)?.[0];
      if (!name) return true;
      // 尚未打开的新文档也可能携带隐藏节点，建立历史持有前不能放行回收。
      const documents = db
        .prepare("SELECT document_id,source_id,baseline_id,epoch FROM whiteboard_documents")
        .all() as { document_id: string; source_id: string; baseline_id: string; epoch: number }[];
      if (
        documents.some(
          document =>
            !journal.contains({
              databaseName: name,
              documentId: document.document_id,
              sourceId: document.source_id,
              baselineId: document.baseline_id,
              epoch: document.epoch,
            })
        )
      )
        return true;
      const holds = journal.holds(name);
      if (kind === "content")
        return holds.some(
          ref =>
            [
              "data-table",
              "project-item",
              "card",
              "article",
              "diary-moment",
              "whiteboard",
              "video-note",
            ].includes(ref.kind) ||
            (ref.kind === "content" && ContentIdentityTable.resolve(db, ref) === localId)
        );
      return holds.some(
        ref => ref.kind === kind && ContentIdentityTable.resolve(db, ref) === localId
      );
    });
    const collect = (name: string) => {
      const db = databaseModule.getDatabase(name);
      if (!db?.open) return;
      try {
        if (this.collectPendingDocuments(db, Date.now(), CONTENT_RELEASE_GRACE_MS))
          WhiteboardContentTable.collectPendingReleases(db, {
            now: Date.now(),
            graceMs: CONTENT_RELEASE_GRACE_MS,
          });
      } catch (error) {
        console.error("白板文档回收未完成，保留原材料", error);
      }
    };
    databaseModule.onDatabaseConnected((name, reason) => {
      if (reason !== "sync_upload_reconnect") collect(name);
    });
    for (const name of databaseModule.databases.keys()) collect(name);
    const watch = (window: BrowserWindow) => {
      const release = () => {
        for (const view of this.sessions.holders({ owner: window.id }))
          this.releaseRemoteView(view.leaseId);
        this.sessions.abandon(window.id);
      };
      window.once("closed", release);
      window.webContents.on("render-process-gone", release);
      window.webContents.on("did-start-navigation", (_event, _url, inPlace, main) => {
        if (main && !inPlace) release();
      });
    };
    BrowserWindow.getAllWindows().forEach(watch);
    app.on("browser-window-created", (_event, window) => watch(window));
  }
  /** 本机差异补交到房间；已在确认状态中时不提交。 */
  async pushLocal(session: DocumentSyncSession, local: Uint8Array): Promise<void> {
    const snapshot = session.snapshot(),
      confirmed = new Y.Doc(),
      doc = new Y.Doc();
    try {
      Y.applyUpdate(confirmed, snapshot.confirmed.state);
      const vector = Y.encodeStateVector(confirmed);
      Y.applyUpdate(confirmed, local);
      if (stateHash(Y.encodeStateAsUpdate(confirmed)) === snapshot.confirmed.protocol.revision)
        return;
      Y.applyUpdate(doc, local);
      await session.stage(Y.encodeStateAsUpdate(doc, vector));
      await session.flush();
    } finally {
      confirmed.destroy();
      doc.destroy();
    }
  }
  /**
   * 结束共享、退出或转为本机：服务端完成后才替换本机副本，失败前白板保持共享且内容不变。
   * 结果未知或服务端已完成时复用固定候选，不重新选择内容和源修订。
   */
  async unshare(
    context: {
      source: { state: Uint8Array };
      db: Database.Database;
      name: string;
      documentId: string;
    },
    request: { operationId: string; mode: WhiteboardUnshareMode }
  ): Promise<{ missing: number }> {
    const store = this.store,
      bindingKey = `whiteboard-binding:${context.name}:${context.documentId}`,
      jobKey = `whiteboard-unshare:${context.name}:${context.documentId}`;
    const binding = store.get<{ serverUrl: string; documentId: string } | null>(bindingKey, null);
    if (!binding) throw new Error("这块白板没有共享");
    const previous = store.get<WhiteboardUnshareJob | null>(jobKey, null);
    if (previous) {
      if (previous.roomId !== binding.documentId) throw new Error("退出任务与共享绑定不一致");
      return this.completeUnshare(context, previous);
    }
    const job: WhiteboardUnshareJob = {
      operationId: request.operationId,
      mode: request.mode,
      serverUrl: binding.serverUrl,
      roomId: binding.documentId,
      missing: [],
    };
    const mode = request.mode;
    let confirmed: Uint8Array | undefined;
    try {
      const { session, release } = await this.remoteSession(job.serverUrl, job.roomId);
      try {
        if (mode !== "detach") {
          try {
            if (mode === "leave" && !session.snapshot().blocked)
              await this.pushLocal(session, context.source.state);
            await session.synchronize();
          } catch (error) {
            // 重试时房间可能已由本操作关闭或已退出：以最后确认的修订继续，由服务端按条件裁决。
            const code = String((error as { code?: unknown }).code);
            if (!["DOCUMENT_CLOSED", "FORBIDDEN"].includes(code)) throw error;
          }
        }
        confirmed = session.snapshot().confirmed.state;
        job.revision = session.snapshot().confirmed.protocol.revision;
      } finally {
        release();
      }
    } catch (error) {
      if (mode !== "detach") throw error;
    }
    const prepared = await prepareUnshareCandidate(
      {
        local: context.source.state,
        confirmed,
        documentId: context.documentId,
        roomId: job.roomId,
        serverUrl: job.serverUrl,
        mode,
      },
      this.assets
    );
    const preparedJob = {
      ...job,
      sourceHash: stateHash(context.source.state),
      missing: prepared.missing,
      candidate: Buffer.from(prepared.candidate).toString("base64"),
    };
    store.set(jobKey, preparedJob);
    return this.completeUnshare(context, preparedJob);
  }

  private async completeUnshare(
    context: { db: Database.Database; name: string; documentId: string },
    job: WhiteboardUnshareJob
  ): Promise<{ missing: number }> {
    const record = this.installation.state.installation(job.operationId);
    if (record?.phase === "COMPLETE") {
      await this.installation.install(context.db, context.name, job.operationId);
      return this.clearUnshare(context.name, context.documentId, job);
    }
    const candidate = job.candidate ?? record?.plan.prepared.candidate;
    if (!candidate) throw new Error("退出共享候选缺失，原内容已保留");
    const current = new WhiteboardDocumentRepository(context.db, context.name).read(
      context.documentId
    );
    if (!record && (!job.sourceHash || current?.hash !== job.sourceHash))
      throw new Error("退出共享的源修订不匹配，不能覆盖当前白板");
    const jobKey = `whiteboard-unshare:${context.name}:${context.documentId}`;
    if (!job.remoteDone) {
      try {
        if (job.mode !== "detach") {
          const client = await this.remoteClient();
          if (job.mode === "close")
            await client.request(job.serverUrl, `/v1/documents/${job.roomId}/close`, "POST", {
              expectedRevision: job.revision,
            });
          else await client.request(job.serverUrl, `/v1/documents/${job.roomId}/leave`, "POST", {});
        }
      } catch (error) {
        // 明确拒绝关闭时没有远端提交，允许重新取回最新修订生成候选。
        if ((error as { code?: string }).code === "REVISION_CONFLICT") this.store.delete(jobKey);
        throw error;
      }
      job = { ...job, remoteDone: true };
      this.store.set(jobKey, job);
    }
    return this.finishUnshare(context, job, Buffer.from(candidate, "base64"));
  }

  private async finishUnshare(
    context: { db: Database.Database; name: string; documentId: string },
    job: WhiteboardUnshareJob,
    candidate: Uint8Array
  ): Promise<{ missing: number }> {
    const original = new WhiteboardDocumentRepository(context.db, context.name).read(
      context.documentId
    )!;
    await this.installation.prepare(context.db, context.name, {
      operationId: job.operationId,
      documentId: context.documentId,
      candidate,
      target: { boardId: original.boardId, pages: [] },
      evidence: { reason: `unshare-${job.mode}`, roomId: job.roomId, missing: job.missing },
    });
    await this.installation.install(context.db, context.name, job.operationId);
    return this.clearUnshare(context.name, context.documentId, job);
  }
  private clearUnshare(name: string, documentId: string, job: WhiteboardUnshareJob) {
    this.store.db.transaction(() => {
      this.store.delete(`whiteboard-binding:${name}:${documentId}`);
      this.store.delete(`whiteboard-unshare:${name}:${documentId}`);
    })();
    return { missing: job.missing.length };
  }

  private readonly pendingUnshares = new Map<string, Promise<void>>();
  async finishPendingUnshare(name: string, contentId: number) {
    const db = databaseModule.getDatabase(name);
    if (!db) throw new Error("资料库未连接");
    const page = db
      .prepare("SELECT document_id FROM whiteboard_document_pages WHERE content_id=?")
      .get(contentId) as { document_id: string } | undefined;
    if (!page) return;
    const key = `whiteboard-unshare:${name}:${page.document_id}`;
    const job = this.store.get<WhiteboardUnshareJob | null>(key, null);
    if (!job) return;
    let pending = this.pendingUnshares.get(key);
    if (!pending) {
      pending = this.unshareQueue
        .run(JSON.stringify([name, page.document_id]), 0, async () => {
          try {
            const pending = this.pendingUnshare(name, page.document_id);
            if (pending)
              await this.completeUnshare({ db, name, documentId: page.document_id }, pending);
            this.transitionDrains.get(job.operationId)?.commit();
            this.clearTransition(job.operationId);
          } catch (error) {
            if (!this.blocked(name, page.document_id)) {
              this.transitionDrains.get(job.operationId)?.rollback();
              this.clearTransition(job.operationId);
            }
            throw error;
          }
        })
        .finally(() => this.pendingUnshares.delete(key));
      this.pendingUnshares.set(key, pending);
    }
    await pending;
  }
  clearTransition(operationId: string) {
    this.transitionDrains.delete(operationId);
    for (const [key, owner] of this.transitionOwners)
      if (owner === operationId) this.transitionOwners.delete(key);
  }
  private views(scope: WhiteboardDrainScope) {
    return this.sessions
      .holders({ owner: scope.windowId, databaseName: scope.databaseName })
      .filter(
        view =>
          !scope.documentId ||
          this.sessions.snapshot(view.leaseId, view.owner).identity.documentId === scope.documentId
      );
  }
  async drain(scope: WhiteboardDrainScope) {
    this.drains.add(scope);
    await Promise.allSettled(
      [...this.preparing]
        .filter(
          entry =>
            (scope.windowId === undefined || scope.windowId === entry.owner) &&
            (!scope.databaseName || scope.databaseName === entry.databaseName) &&
            (!scope.documentId || scope.documentId === entry.documentId)
        )
        .map(entry => entry.task)
    );
    const views = this.views(scope).map(view => ({ ...view, requestId: randomUUID() }));
    let active = true;
    const cancellations: (() => void)[] = [];
    const resume = () => {
      for (const view of views) {
        try {
          this.sessions.seal(view.leaseId, view.owner, view.requestId, false);
        } catch {
          // 已消失的租约无需解封，其它视图仍需收到恢复通知。
        }
        const window = BrowserWindow.fromId(view.owner);
        if (window && !window.isDestroyed())
          window.webContents.send("whiteboard-document:resume", {
            leaseId: view.leaseId,
            requestId: view.requestId,
          });
      }
    };
    try {
      await Promise.all(
        views.map(
          view =>
            new Promise<void>((resolve, reject) => {
              const requestId = view.requestId,
                window = BrowserWindow.fromId(view.owner);
              if (!window || window.isDestroyed()) {
                reject(new DrainInterrupted("白板窗口不可达"));
                return;
              }
              const timer = setTimeout(() => {
                this.waiters.delete(requestId);
                reject(new DrainInterrupted("等待白板保存确认超时，已保留会话"));
              }, 8000);
              cancellations.push(() => {
                clearTimeout(timer);
                this.waiters.delete(requestId);
                reject(new DrainInterrupted("关闭已取消"));
              });
              this.waiters.set(requestId, {
                owner: view.owner,
                resolve: error => {
                  clearTimeout(timer);
                  this.waiters.delete(requestId);
                  if (!active) {
                    reject(new DrainInterrupted("关闭已取消"));
                    return;
                  }
                  if (error) reject(new Error(error));
                  else {
                    try {
                      this.sessions.seal(view.leaseId, view.owner, requestId, true);
                      resolve();
                    } catch (cause) {
                      reject(cause);
                    }
                  }
                },
              });
              window.webContents.send("whiteboard-document:drain", {
                leaseId: view.leaseId,
                requestId,
                sealed: true,
              });
            })
        )
      );
      for (const view of views) await this.sessions.flush(view.leaseId, view.owner);
      if (scope.windowId === undefined && !scope.documentId) {
        const names = scope.databaseName
          ? [scope.databaseName]
          : [...databaseModule.databases.keys()];
        for (const name of names) {
          if (databaseModule.getDatabase(name)?.open) {
            await this.sessions.flushDatabase(name);
          }
        }
      }
      return {
        commit: () => {
          this.drains.delete(scope);
          views.forEach(view => {
            this.sessions.detach(view.leaseId, view.owner);
            this.releaseRemoteView(view.leaseId);
            const window = BrowserWindow.fromId(view.owner);
            if (window && !window.isDestroyed())
              window.webContents.send("whiteboard-document:detached", { leaseId: view.leaseId });
          });
        },
        rollback: () => {
          this.drains.delete(scope);
          resume();
        },
      };
    } catch (error) {
      this.drains.delete(scope);
      active = false;
      cancellations.forEach(cancel => cancel());
      resume();
      // 窗口回报的保存错误与落盘错误留在会话里，重试不会消失，需重开白板。
      const code =
        error instanceof DrainInterrupted ? "DURABLE_DOCUMENT_UNSAVED" : "DURABLE_DOCUMENT_FAILED";
      throw new Error(`${code}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
const whiteboardDocumentsModule = new WhiteboardDocumentsModule();
export default whiteboardDocumentsModule;
