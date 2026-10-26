import { WhiteboardTransitions } from "./transitions";
import { WhiteboardInstallation } from "./installation";
import { isVideoFile } from "../collaboration/asset-service";
import ContentTable, { CONTENT_RELEASE_GRACE_MS } from "../tables/content";
import {
  isContentEntityReference,
  CONTENT_ENTITY_KINDS,
  type ContentEntityKind,
} from "@tau/db-schema/content-identities";
import * as Y from "yjs";
import {
  normalizeServerUrl,
  WhiteboardModel,
  exportWhiteboardTransfer,
  type DocumentSyncSession,
} from "@tau/collaboration";
import collaborationModule from "../collaboration";
import { openWhiteboardRemoteSession } from "./remote";
import DataTableTable from "../tables/data-table";
import WhiteboardContentTable from "../tables/white-board-content";
import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import databaseModule from "../database";
import PathUtil from "../../utils/PathUtil";
import { ContentIdentityTable } from "../tables/content-identity";
import { ContentRetention } from "../collaboration/content-retention";
import { WhiteboardJournal, stateHash } from "./journal";
import { WhiteboardDocumentSessions } from "./sessions";
import { WhiteboardDocumentRepository } from "./repository";
import { registerDurableDocuments, type DocumentDrainScope } from "../durable-document-lifecycle";
import { registerDurableEntityHolds } from "../durable-entity-holds";
import type {
  WhiteboardRemoteStatus,
  WhiteboardShareCandidate,
  WhiteboardShareStatus,
} from "@/types/whiteboard-document";
import type Database from "better-sqlite3";
import {
  prepareUnshareCandidate,
  type WhiteboardUnshareJob,
  type WhiteboardUnshareMode,
} from "./unshare";
type WhiteboardDrainScope = DocumentDrainScope & { documentId?: string };
type RemoteSnapshot = ReturnType<DocumentSyncSession["snapshot"]>;
const ROOM_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
/** IPC 只保留错误文本，按服务端代码加前缀，渲染端据此区分断网、权限与版本。 */
function remoteFailure(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (/^[A-Z][A-Z_]+: /.test(message)) throw error;
  const failure = error as { code?: unknown; status?: unknown; name?: unknown };
  const code =
    typeof failure.code === "string" && failure.code !== "REQUEST_FAILED"
      ? failure.code
      : typeof failure.status === "number"
        ? failure.status >= 500
          ? "OFFLINE"
          : "REMOTE_FAILED"
        : ["TypeError", "TimeoutError", "AbortError"].includes(String(failure.name))
          ? "OFFLINE"
          : "REMOTE_FAILED";
  throw new Error(`${code}: ${message}`);
}
const sameBaseline = (
  left: RemoteSnapshot["confirmed"]["protocol"],
  right: RemoteSnapshot["confirmed"]["protocol"]
) => left.id === right.id && left.epoch === right.epoch && left.baselineId === right.baselineId;
/**
 * 只有同一确认基线上的被拒分支可能已混入本机副本；换代前保全的旧分支不污染新副本，
 * 已用确认快照重建本机副本之前的分支（前 clean 条）也不再污染。
 */
const taintedBy = (snapshot: RemoteSnapshot, clean = 0) =>
  snapshot.rejected
    .slice(clean)
    .some(branch => sameBaseline(branch.baseline.protocol, snapshot.confirmed.protocol));
const remoteStatus = (
  snapshot: RemoteSnapshot,
  status: Omit<WhiteboardRemoteStatus, "pending">
): WhiteboardRemoteStatus => ({ ...status, pending: snapshot.pending.length });
/** 排空时窗口未及回执（不可达、超时、被并发操作取消）；会话本身完好，稍后重试即可。 */
class DrainInterrupted extends Error {}
class WhiteboardDocumentsModule {
  private installation!: WhiteboardInstallation;
  private transitions!: WhiteboardTransitions;
  private transitionPreparing = new Map<string, Promise<void>>();
  private transitionOwners = new Map<string, string>();
  private transitionDrains = new Map<
    string,
    Awaited<ReturnType<WhiteboardDocumentsModule["drain"]>>
  >();
  name = "whiteboard-documents";
  private sessions!: WhiteboardDocumentSessions;
  private remote = new Map<string, Promise<DocumentSyncSession>>();
  private remoteViews = new Map<string, { key: string; rejectedCount: number }>();
  private remoteSyncs = new Map<string, Promise<unknown>>();
  private journal!: WhiteboardJournal;
  private store!: ReturnType<typeof collaborationModule.documentStorage>["store"];
  private assertOwnerDeletion(db: Database.Database, id: number): string {
    const name = [...databaseModule.databases].find(([, value]) => value === db)?.[0];
    if (name === undefined || !this.sessions || !this.store)
      throw new Error("白板文档服务尚未就绪");
    const row = db
      .prepare("SELECT document_id FROM whiteboard_documents WHERE board_id=?")
      .get(id) as { document_id: string } | undefined;
    if (!row) return "";
    if (this.store.get(`whiteboard-binding:${name}:${row.document_id}`, null))
      throw new Error("请先结束共享或退出协作，再删除本机白板");
    if (this.transitions.blocked(name, row.document_id))
      throw new Error("白板仍有未完成转换，不能删除");
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
    if (this.store.get(`whiteboard-binding:${name}:${row.document_id}`, null))
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
        const visible = new Set(table.getWhiteboard(db, id).whiteBoardContentIds);
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
  collectPendingDocuments(db: Database.Database, now: number, graceMs: number): number {
    const name = [...databaseModule.databases].find(([, value]) => value === db)?.[0];
    if (name === undefined || !this.sessions || !this.store) return 0;
    const retention = new ContentRetention(collaborationModule.documentStorage().state);
    let collected = 0;
    for (const { document_id } of db
      .prepare("SELECT document_id FROM whiteboard_documents WHERE board_id IS NULL")
      .all() as { document_id: string }[]) {
      if (
        this.sessions.isActive(name, document_id) ||
        this.transitions.blocked(name, document_id) ||
        this.store.get(`whiteboard-binding:${name}:${document_id}`, null)
      )
        continue;
      const previousRoom = this.store.get<{ roomId: string } | null>(
        `whiteboard-unshare:${name}:${document_id}`,
        null
      );
      const rooms = new Set([
        document_id,
        ...(previousRoom ? [previousRoom.roomId] : []),
        ...this.store
          .get<{ workspaceId: string; documentId: string; roomId?: string }[]>(
            "whiteboard-publications",
            []
          )
          .filter(job => job.workspaceId === name && job.documentId === document_id && job.roomId)
          .map(job => job.roomId!),
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
            retention.has(db, name, "whiteboard-content", page.id) ||
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
  private cleanRejected(key: string): number {
    return this.store.get<number>(`whiteboard-remote-clean:${key}`, 0);
  }
  /** 同一服务地址、设备身份与房间只建立一个网络会话，多窗口和多视图共用。 */
  private async remoteSession(serverUrl: string, documentId: string) {
    const client = collaborationModule.documentClient(),
      url = client.canonicalUrl(normalizeServerUrl(serverUrl)),
      identity = await client.identity(url);
    const key = JSON.stringify([url, identity.id, documentId]);
    let opening = this.remote.get(key);
    if (!opening) {
      opening = openWhiteboardRemoteSession(this.journal, client, url, documentId);
      this.remote.set(key, opening);
      void opening.catch(() => {
        if (this.remote.get(key) === opening) this.remote.delete(key);
      });
    }
    return { key, url, session: await opening };
  }
  /** 同一房间的同步串行执行，避免两个窗口把同一份本机差异重复提交。 */
  private serialRemote<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.remoteSyncs.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    this.remoteSyncs.set(key, next);
    void next
      .catch(() => undefined)
      .finally(() => {
        if (this.remoteSyncs.get(key) === next) this.remoteSyncs.delete(key);
      });
    return next;
  }
  private drains = new Set<WhiteboardDrainScope>();
  private preparing = new Set<{ owner: number; databaseName: string; task: Promise<unknown> }>();
  private async prepareView<T>(owner: number, databaseName: string, task: Promise<T>): Promise<T> {
    const entry = { owner, databaseName, task };
    this.preparing.add(entry);
    try {
      return await task;
    } finally {
      this.preparing.delete(entry);
    }
  }
  private assertOpenAllowed(owner: number, databaseName: string): void {
    if (
      [...this.drains].some(
        scope =>
          (scope.windowId === undefined || scope.windowId === owner) &&
          (!scope.databaseName || scope.databaseName === databaseName)
      )
    )
      throw new Error("白板正在关闭或切库，请稍后重试");
  }
  private waiters = new Map<string, { owner: number; resolve: (error?: string) => void }>();
  private owner(event: IpcMainInvokeEvent, databaseName?: string): number {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed() || event.sender.isDestroyed())
      throw new Error("白板窗口已关闭");
    if (databaseName && databaseModule.windowToDatabase.get(window.id) !== databaseName)
      throw new Error("白板请求来自旧资料库");
    return window.id;
  }
  private leaseOwner(event: IpcMainInvokeEvent, leaseId: string): number {
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
      (name, id) => this.transitions.blocked(name, id)
    );
    const services = collaborationModule.documentStorage();
    this.store = services.store;
    this.installation = new WhiteboardInstallation(
      services.state,
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
      services.store,
      collaborationModule.documentClient(),
      collaborationModule.documentAssets()
    );
    const handle = (name: string, fn: (event: IpcMainInvokeEvent, ...args: any[]) => unknown) =>
      ipcMain.handle(`whiteboard-document:${name}`, fn);
    const transitionContext = async (
      event: IpcMainInvokeEvent,
      leaseId: string,
      operationId: string
    ) => {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(operationId))
        throw new Error("共享操作身份无效");
      const owner = this.leaseOwner(event, leaseId);
      const source = this.sessions.snapshot(leaseId, owner);
      const scope = JSON.stringify([source.identity.databaseName, source.identity.documentId]);
      if (this.transitionOwners.has(scope) && this.transitionOwners.get(scope) !== operationId)
        throw new Error("白板已有正在处理的共享操作");
      this.transitionOwners.set(scope, operationId);
      if (!this.transitionDrains.has(operationId)) {
        let preparing = this.transitionPreparing.get(operationId);
        if (!preparing) {
          preparing = this.drain({
            databaseName: source.identity.databaseName,
            documentId: source.identity.documentId,
            reason: "database-change",
          }).then(drain => {
            this.transitionDrains.set(operationId, drain);
          });
          this.transitionPreparing.set(operationId, preparing);
        }
        try {
          await preparing;
        } catch (error) {
          this.transitionOwners.delete(scope);
          throw error;
        } finally {
          this.transitionPreparing.delete(operationId);
        }
      }
      const current = this.sessions.snapshot(leaseId, owner);
      const db = databaseModule.getDatabase(current.identity.databaseName)!;
      return {
        source: current,
        db,
        name: current.identity.databaseName,
        documentId: current.identity.documentId,
      };
    };
    handle(
      "publish",
      async (
        event,
        leaseId: string,
        request: { operationId: string; serverUrl: string; pageIds: string[] }
      ) => {
        // 已绑定时直接拒绝，不为一次必然失败的请求冻结所有视图。
        const identity = this.sessions.snapshot(leaseId, this.leaseOwner(event, leaseId)).identity,
          bindingKey = `whiteboard-binding:${identity.databaseName}:${identity.documentId}`;
        if (services.store.get(bindingKey, null))
          throw new Error("此白板已绑定共享，不能再次创建并行房间");
        const context = await transitionContext(event, leaseId, request.operationId);
        try {
          const result = await this.transitions.publish(
            context.db,
            context.name,
            context.documentId,
            request
          );
          this.transitionDrains.get(request.operationId)?.commit();
          this.clearTransition(request.operationId);
          projected(context.name, context.documentId);
          void collaborationModule.refreshShared?.().catch(() => undefined);
          return result;
        } catch (error) {
          if (!this.transitions.blocked(context.name, context.documentId)) {
            this.transitionDrains.get(request.operationId)?.rollback();
            this.clearTransition(request.operationId);
          }
          remoteFailure(error);
        }
      }
    );
    handle("publish-resume", async (event, databaseName: string, operationId: string) => {
      this.owner(event, databaseName);
      const db = databaseModule.getDatabase(databaseName);
      if (!db) throw new Error("原资料库未连接");
      const documentId = this.transitions.publicationDocument(databaseName, operationId);
      const result = await this.transitions
        .resumePublication(db, databaseName, operationId)
        .catch(remoteFailure);
      this.transitionDrains.get(operationId)?.commit();
      this.clearTransition(operationId);
      if (documentId) projected(databaseName, documentId);
      void collaborationModule.refreshShared?.().catch(() => undefined);
      return result;
    });
    handle("publish-cancel", async (event, databaseName: string, operationId: string) => {
      this.owner(event, databaseName);
      const documentId = this.transitions.publicationDocument(databaseName, operationId);
      await this.transitions.cancelPublication(databaseName, operationId).catch(remoteFailure);
      this.transitionDrains.get(operationId)?.rollback();
      this.clearTransition(operationId);
      if (documentId) projected(databaseName, documentId);
    });
    handle(
      "share-status",
      (event, databaseName: string, documentId: string): WhiteboardShareStatus => {
        this.owner(event, databaseName);
        const bindingKey = `whiteboard-binding:${databaseName}:${documentId}`,
          unshareKey = `whiteboard-unshare:${databaseName}:${documentId}`;
        // 本机替换已装完、只差清除绑定时补完收尾，避免本机文档再去连接已关闭的房间。
        if (services.store.get<WhiteboardUnshareJob | null>(unshareKey, null)?.remoteDone) {
          const db = databaseModule.getDatabase(databaseName),
            stored = db && new WhiteboardDocumentRepository(db, databaseName).read(documentId);
          if (stored && !this.installation.pending(databaseName, documentId)) {
            const doc = new Y.Doc();
            Y.applyUpdate(doc, stored.state);
            if (!doc.share.has("meta") || doc.getMap("meta").get("version") !== 3) {
              services.store.delete(bindingKey);
              services.store.delete(unshareKey);
            }
            doc.destroy();
          }
        }
        const publication = this.transitions.pendingPublication(databaseName, documentId);
        return {
          binding: services.store.get<WhiteboardShareStatus["binding"]>(bindingKey, null),
          publication,
        };
      }
    );
    handle(
      "remote-install",
      async (event, databaseName: string, serverUrl: string, roomId: string) => {
        const windowId = this.owner(event, databaseName);
        this.assertOpenAllowed(windowId, databaseName);
        if (typeof roomId !== "string" || !ROOM_ID.test(roomId))
          throw new Error("共享白板身份无效");
        const db = databaseModule.getDatabase(databaseName);
        if (!db) throw new Error("资料库未连接");
        const url = collaborationModule
          .documentClient()
          .canonicalUrl(normalizeServerUrl(serverUrl));
        const pages = (documentId: string) => {
          const stored = new WhiteboardDocumentRepository(db, databaseName).read(documentId);
          if (!stored) return null;
          return {
            documentId,
            boardId: stored.boardId,
            contentIds: (
              db
                .prepare(
                  "SELECT content_id FROM whiteboard_document_pages WHERE document_id=? AND visible=1 ORDER BY page_index"
                )
                .all(documentId) as { content_id: number }[]
            ).map(row => row.content_id),
          };
        };
        const prefix = `whiteboard-binding:${databaseName}:`;
        for (const row of services.store.db
          .prepare("SELECT key,value FROM settings WHERE key LIKE 'whiteboard-binding:%'")
          .all() as { key: string; value: string }[]) {
          if (!row.key.startsWith(prefix)) continue;
          const binding = JSON.parse(row.value) as { serverUrl: string; documentId: string };
          if (binding.documentId !== roomId || binding.serverUrl !== url) continue;
          const existing = pages(row.key.slice(prefix.length));
          if (existing) return existing;
        }
        // 先固定本机文档身份，重试时沿用同一身份，避免在本库重复落一份副本。
        const installKey = `whiteboard-install:${databaseName}:${url}:${roomId}`;
        const install = services.store.get<{ documentId: string } | null>(installKey, null) ?? {
          documentId: randomUUID(),
        };
        services.store.set(installKey, install);
        if (!pages(install.documentId)) {
          const { session } = await this.remoteSession(url, roomId).catch(remoteFailure);
          await session.synchronize().catch(remoteFailure);
          const confirmed = session.snapshot().confirmed;
          if (confirmed.protocol.id !== roomId) throw new Error("共享白板身份与远端确认不一致");
          this.owner(event, databaseName);
          await this.prepareView(
            windowId,
            databaseName,
            this.sessions.create(databaseName, install.documentId, confirmed.state, "board")
          );
        }
        services.store.set(`${prefix}${install.documentId}`, {
          serverUrl: url,
          documentId: roomId,
        });
        services.store.delete(installKey);
        projected(databaseName, install.documentId);
        return pages(install.documentId)!;
      }
    );
    handle(
      "unshare",
      async (
        event,
        leaseId: string,
        request: { operationId: string; mode: WhiteboardUnshareMode }
      ) => {
        if (!["close", "leave", "detach"].includes(request?.mode))
          throw new Error("结束共享方式无效");
        const context = await transitionContext(event, leaseId, request.operationId);
        try {
          const result = await this.unshare(context, request);
          this.transitionDrains.get(request.operationId)?.commit();
          this.clearTransition(request.operationId);
          projected(context.name, context.documentId);
          void collaborationModule.refreshShared?.().catch(() => undefined);
          return result;
        } catch (error) {
          if (!this.transitions.blocked(context.name, context.documentId)) {
            this.transitionDrains.get(request.operationId)?.rollback();
            this.clearTransition(request.operationId);
          }
          remoteFailure(error);
        }
      }
    );
    const resourceContext = (event: IpcMainInvokeEvent, leaseId: string) => {
      const owner = this.leaseOwner(event, leaseId),
        local = this.sessions.snapshot(leaseId, owner);
      this.assertOpenAllowed(owner, local.identity.databaseName);
      const key = this.remoteViews.get(leaseId)?.key;
      const binding = services.store.get<{ serverUrl: string; documentId: string } | null>(
        `whiteboard-binding:${local.identity.databaseName}:${local.identity.documentId}`,
        null
      );
      const [url, , remoteId] = key
        ? (JSON.parse(key) as string[])
        : [binding?.serverUrl, undefined, binding?.documentId];
      return { owner, documentId: remoteId ?? local.identity.documentId, url: url ?? "", key };
    };
    const resourceAccess = async (key?: string) => {
      if (!key) return;
      const session = await this.remote.get(key);
      if (!session || session.snapshot().blocked)
        throw new Error("文档权限或同步状态不可用，不能读取或上传资源");
    };
    handle("copy-content", async (event, leaseId: string, elementId: string) => {
      const context = resourceContext(event, leaseId);
      await resourceAccess(context.key);
      const local = this.sessions.snapshot(leaseId, context.owner),
        doc = new Y.Doc();
      Y.applyUpdate(doc, local.state);
      const model = new WhiteboardModel(doc);
      try {
        const bundle = exportWhiteboardTransfer(model, context.documentId, [elementId]);
        const node = bundle.pages
          .flatMap(page => page.elements)
          .find(node => node.id === elementId);
        if (!node || !Array.isArray(node.body)) throw new Error("板内正文不存在");
        const contracts = Object.fromEntries(
          Object.entries(bundle.contracts).filter(
            ([, contract]) => contract.domain === "editor-node"
          )
        );
        const assets = collaborationModule.documentAssets();
        for (const reference of bundle.resources.filter(ref => ref.startsWith("tau-collab-")))
          await assets.readTransferFile(context.url, context.documentId, reference);
        const value = await assets.localizeDocument(
          context.url,
          context.documentId,
          { title: "", bannerBg: "", bannerPosition: "center", content: [...node.body] },
          contracts
        );
        resourceContext(event, leaseId);
        await resourceAccess(context.key);
        const db = databaseModule.getDatabase(local.identity.databaseName);
        if (!db) throw new Error("原资料库已关闭");
        return ContentTable.createPendingContent(db, {
          content: value.content as unknown as import("slate").Descendant[],
          contracts,
        });
      } finally {
        model.dispose();
        doc.destroy();
      }
    });
    handle("resource-read", async (event, leaseId: string, reference: string) => {
      const context = resourceContext(event, leaseId);
      await resourceAccess(context.key);
      const file = await collaborationModule
        .documentAssets()
        .readTransferFile(context.url, context.documentId, reference);
      resourceContext(event, leaseId);
      await resourceAccess(context.key);
      return file;
    });
    handle(
      "resource-import",
      async (event, leaseId: string, sourceDocumentId: string, reference: string) => {
        const target = resourceContext(event, leaseId);
        const source = this.sessions
          .holders({ owner: target.owner })
          .find(
            view =>
              this.sessions.snapshot(view.leaseId, target.owner).identity.documentId ===
              sourceDocumentId
          );
        if (!source) throw new Error("请先打开有权访问的源白板，资源尚未导入");
        const origin = resourceContext(event, source.leaseId);
        await resourceAccess(origin.key);
        await resourceAccess(target.key);
        const assets = collaborationModule.documentAssets();
        const file = await assets.readTransferFile(origin.url, origin.documentId, reference);
        resourceContext(event, source.leaseId);
        resourceContext(event, leaseId);
        await resourceAccess(origin.key);
        await resourceAccess(target.key);
        const copied =
          !target.url || isVideoFile(file)
            ? await assets.keepLocalFile(target.documentId, file)
            : await assets.enqueue(target.documentId, file);
        if (target.url && !isVideoFile(file)) await assets.flush(target.url, target.documentId);
        resourceContext(event, leaseId);
        await resourceAccess(target.key);
        return copied;
      }
    );
    handle(
      "resource-upload",
      async (
        event,
        leaseId: string,
        payload: { name: string; mime: string; bytes: Uint8Array }
      ) => {
        const context = resourceContext(event, leaseId);
        if (
          !payload ||
          typeof payload.name !== "string" ||
          typeof payload.mime !== "string" ||
          !(payload.bytes instanceof Uint8Array) ||
          payload.bytes.byteLength > 25 * 1024 * 1024
        )
          throw new Error("资源超过预算或格式无效");
        await resourceAccess(context.key);
        const assets = collaborationModule.documentAssets();
        const reference =
          !context.url || isVideoFile(payload)
            ? await assets.keepLocalFile(context.documentId, payload)
            : await assets.enqueue(context.documentId, payload);
        if (context.url && !isVideoFile(payload))
          await assets.flush(context.url, context.documentId);
        const current = resourceContext(event, leaseId);
        if (current.key !== context.key || current.documentId !== context.documentId)
          throw new Error("资源所属会话已变化，已保留上传结果");
        return reference;
      }
    );
    handle("resource-resolve", async (event, leaseId: string, reference: string) => {
      const context = resourceContext(event, leaseId);
      if (!/^tau-collab-(asset|local):[a-f0-9-]{36}$/.test(reference))
        throw new Error("只允许解析此文档的资源标识");
      await resourceAccess(context.key);
      const value = await collaborationModule
        .documentAssets()
        .resolveReference(context.url, context.documentId, reference);
      const current = resourceContext(event, leaseId);
      if (current.key !== context.key || current.documentId !== context.documentId)
        throw new Error("资源所属会话已变化");
      return value;
    });
    handle(
      "reference-entity",
      (event, databaseName: string, kind: ContentEntityKind, id: number) => {
        this.owner(event, databaseName);
        this.assertOpenAllowed(this.owner(event), databaseName);
        if (!CONTENT_ENTITY_KINDS.includes(kind)) throw new Error("实体种类无效");
        const db = databaseModule.getDatabase(databaseName);
        if (!db) throw new Error("资料库未连接");
        return ContentIdentityTable.reference(db, kind, id);
      }
    );
    handle("resolve-entity", (event, databaseName: string, reference: unknown) => {
      this.owner(event, databaseName);
      if (!isContentEntityReference(reference)) throw new Error("实体引用无效");
      const db = databaseModule.getDatabase(databaseName);
      if (!db) throw new Error("资料库未连接");
      return ContentIdentityTable.resolve(db, reference);
    });
    handle("locate", (event, databaseName: string, contentId: number) => {
      this.owner(event, databaseName);
      const db = databaseModule.getDatabase(databaseName);
      if (!db) throw new Error("资料库未连接");
      const found = new WhiteboardDocumentRepository(db, databaseName).byPage(contentId);
      return found ? { documentId: found.document.documentId, pageId: found.pageId } : null;
    });
    handle(
      "share-candidates",
      (event, databaseName: string, keyword: string): WhiteboardShareCandidate[] => {
        this.owner(event, databaseName);
        const db = databaseModule.getDatabase(databaseName);
        if (!db) throw new Error("资料库未连接");
        const prefix = `whiteboard-binding:${databaseName}:`;
        const shared = (
          services.store.db
            .prepare("SELECT key FROM settings WHERE key LIKE 'whiteboard-binding:%'")
            .all() as { key: string }[]
        )
          .filter(row => row.key.startsWith(prefix))
          .map(row => row.key.slice(prefix.length));
        // 未完成的首次发布只能在白板页续做或取消，不作为新候选。
        return new WhiteboardDocumentRepository(db, databaseName)
          .shareCandidates(keyword.trim(), shared, 30)
          .filter(row => !this.transitions.pendingPublication(databaseName, row.documentId));
      }
    );
    handle("resolve-page", (event, databaseName: string, documentId: string, pageId: string) => {
      this.owner(event, databaseName);
      const db = databaseModule.getDatabase(databaseName);
      if (!db) throw new Error("资料库未连接");
      if (!new WhiteboardDocumentRepository(db, databaseName).read(documentId))
        throw new Error("白板文档不存在");
      const row = db
        .prepare(
          "SELECT content_id FROM whiteboard_document_pages WHERE document_id=? AND page_id=? AND visible=1"
        )
        .get(documentId, pageId) as { content_id: number } | undefined;
      if (!row) throw new Error("白板页面尚未完成投影");
      return row.content_id;
    });
    handle(
      "create",
      async (
        event,
        databaseName: string,
        requestId: string,
        state: Uint8Array,
        owner: "board" | "standalone"
      ) => {
        const windowId = this.owner(event, databaseName);
        this.assertOpenAllowed(windowId, databaseName);
        const created = await this.prepareView(
          windowId,
          databaseName,
          this.sessions.create(databaseName, requestId, state, owner)
        );
        projected(databaseName, created.documentId);
        return created;
      }
    );
    handle("open", async (event, databaseName: string, contentId: number, viewId: string) => {
      const owner = this.owner(event, databaseName);
      if (
        [...this.drains].some(
          scope =>
            !scope.documentId &&
            (scope.windowId === undefined || scope.windowId === owner) &&
            (!scope.databaseName || scope.databaseName === databaseName)
        )
      )
        throw new Error("白板正在关闭或切库，请稍后重试");
      await this.finishPendingUnshare(databaseName, contentId);
      this.owner(event, databaseName);
      this.assertOpenAllowed(owner, databaseName);
      const result = await this.prepareView(
        owner,
        databaseName,
        this.sessions.open(databaseName, contentId, owner, viewId)
      );
      try {
        this.owner(event, databaseName);
      } catch (error) {
        this.sessions.abandon(owner);
        throw error;
      }
      return result;
    });
    handle("append", (event, leaseId: string, batchId: string, update: Uint8Array) =>
      this.sessions.append(leaseId, this.leaseOwner(event, leaseId), batchId, update)
    );
    handle("snapshot", (event, leaseId: string) =>
      this.sessions.snapshot(leaseId, this.leaseOwner(event, leaseId))
    );
    handle("flush", (event, leaseId: string) =>
      this.sessions.flush(leaseId, this.leaseOwner(event, leaseId))
    );
    handle("release", (event, leaseId: string) => {
      const owner = this.leaseOwner(event, leaseId);
      return this.sessions.release(leaseId, owner).then(() => {
        this.remoteViews.delete(leaseId);
      });
    });
    handle("remote-open", async (event, leaseId: string, serverUrl: string) => {
      const owner = this.leaseOwner(event, leaseId),
        local = this.sessions.snapshot(leaseId, owner);
      this.assertOpenAllowed(owner, local.identity.databaseName);
      return this.prepareView(
        owner,
        local.identity.databaseName,
        (async () => {
          const doc = new Y.Doc();
          try {
            Y.applyUpdate(doc, local.state);
            const meta = doc.getMap("meta"),
              documentId = meta.get("documentId");
            if (meta.get("version") !== 3 || typeof documentId !== "string")
              throw new Error("白板尚未绑定共享基线；首次发布须经独立发布流程");
            const { key, session: remote } = await this.remoteSession(serverUrl, documentId).catch(
              remoteFailure
            );
            this.leaseOwner(event, leaseId);
            const onBaseline = (value: RemoteSnapshot) =>
              meta.get("epoch") === value.confirmed.protocol.epoch &&
              meta.get("baselineId") === value.confirmed.protocol.baselineId;
            let snapshot = remote.snapshot();
            // 本机已装新代次（作者升级或采用新版本）而网络会话仍停在旧确认时，先取回最新确认再比较。
            if (!onBaseline(snapshot)) {
              await remote.synchronize().catch(remoteFailure);
              snapshot = remote.snapshot();
            }
            const clean = stateHash(local.state) === snapshot.confirmed.protocol.revision;
            // 本机副本位于当前确认基线且未混入同基线的被拒分支（或恰为确认快照）时，解除隔离继续发送。
            if (
              snapshot.blocked &&
              onBaseline(snapshot) &&
              (clean || !taintedBy(snapshot, this.cleanRejected(key)))
            ) {
              await remote.restartFromConfirmed().catch(remoteFailure);
              snapshot = remote.snapshot();
            }
            if (!onBaseline(snapshot))
              return remoteStatus(snapshot, { requiresRebind: true, reason: "epoch" });
            if (
              (snapshot.blocked || taintedBy(snapshot, this.cleanRejected(key))) &&
              stateHash(local.state) !== snapshot.confirmed.protocol.revision
            )
              return remoteStatus(snapshot, { requiresRebind: true, reason: "rejected" });
            this.remoteViews.set(leaseId, { key, rejectedCount: snapshot.rejected.length });
            return remoteStatus(snapshot, { requiresRebind: false });
          } finally {
            doc.destroy();
          }
        })()
      );
    });
    handle(
      "remote-stage",
      async (
        event,
        leaseId: string,
        update: Uint8Array,
        condition?: { revision: string; sequence: number },
        operationId?: string
      ) => {
        const owner = this.leaseOwner(event, leaseId),
          local = this.sessions.snapshot(leaseId, owner);
        this.assertOpenAllowed(owner, local.identity.databaseName);
        const binding = this.remoteViews.get(leaseId),
          key = binding?.key,
          session = key && this.remote.get(key);
        if (!session) throw new Error("白板远端会话未打开");
        return this.prepareView(
          owner,
          local.identity.databaseName,
          (async () => {
            const remote = await session;
            if (remote.snapshot().rejected.length !== binding!.rejectedCount)
              throw new Error("BRANCH_RETAINED: 被拒分支已保全，请重建确认副本");
            const protocol = remote.snapshot().confirmed.protocol,
              doc = new Y.Doc();
            try {
              Y.applyUpdate(doc, local.state);
              const meta = doc.getMap("meta");
              if (
                meta.get("documentId") !== protocol.id ||
                meta.get("baselineId") !== protocol.baselineId ||
                meta.get("epoch") !== protocol.epoch
              )
                throw new Error("EPOCH_CONFLICT: 旧白板材料已保留，请先完成基线重绑");
              return remote.stage(new Uint8Array(update), condition, operationId);
            } finally {
              doc.destroy();
            }
          })()
        );
      }
    );
    handle("remote-sync", async (event, leaseId: string) => {
      const owner = this.leaseOwner(event, leaseId),
        binding = this.remoteViews.get(leaseId),
        pending = binding && this.remote.get(binding.key);
      if (!pending) throw new Error("白板远端会话未打开");
      const session = await pending;
      return this.serialRemote(binding!.key, async () => {
        const rebind = (snapshot: RemoteSnapshot, meta: { get(key: string): unknown }) =>
          remoteStatus(snapshot, {
            requiresRebind: true,
            reason:
              meta.get("epoch") !== snapshot.confirmed.protocol.epoch ||
              meta.get("baselineId") !== snapshot.confirmed.protocol.baselineId
                ? "epoch"
                : "rejected",
          });
        const metaOf = (state: Uint8Array) => {
          const doc = new Y.Doc();
          try {
            Y.applyUpdate(doc, state);
            return new Map<string, unknown>(doc.getMap("meta").entries());
          } finally {
            doc.destroy();
          }
        };
        if (!session.snapshot().blocked) await session.flush().catch(remoteFailure);
        if (!session.snapshot().blocked) await session.synchronize().catch(remoteFailure);
        let snapshot = session.snapshot();
        const local = this.sessions.snapshot(leaseId, owner),
          doc = new Y.Doc();
        try {
          Y.applyUpdate(doc, local.state);
          const meta = doc.getMap("meta"),
            protocol = snapshot.confirmed.protocol;
          if (
            snapshot.blocked ||
            snapshot.rejected.length !== binding!.rejectedCount ||
            meta.get("documentId") !== protocol.id ||
            meta.get("baselineId") !== protocol.baselineId ||
            meta.get("epoch") !== protocol.epoch
          )
            return rebind(snapshot, meta);
          await this.pushLocal(session, local.state).catch(remoteFailure);
          snapshot = session.snapshot();
          if (
            snapshot.blocked ||
            snapshot.confirmed.protocol.epoch !== protocol.epoch ||
            snapshot.confirmed.protocol.baselineId !== protocol.baselineId
          )
            return rebind(snapshot, metaOf(local.state));
          const requiresSync = this.sessions.snapshot(leaseId, owner).revision !== local.revision;
          const next = snapshot.confirmed.protocol;
          // 只把本机尚缺的远端内容作为一个批次写入本机日志；无新内容时不推进本机修订。
          const current = new Y.Doc();
          try {
            Y.applyUpdate(current, this.sessions.snapshot(leaseId, owner).state);
            const before = stateHash(Y.encodeStateAsUpdate(current)),
              localVector = Y.encodeStateVector(current);
            Y.applyUpdate(current, snapshot.confirmed.state);
            if (stateHash(Y.encodeStateAsUpdate(current)) !== before) {
              const missing = new Y.Doc();
              try {
                Y.applyUpdate(missing, snapshot.confirmed.state);
                await this.sessions.append(
                  leaseId,
                  owner,
                  `remote:${next.sequence}:${next.revision}`,
                  Y.encodeStateAsUpdate(missing, localVector)
                );
              } finally {
                missing.destroy();
              }
            }
          } finally {
            current.destroy();
          }
          return remoteStatus(snapshot, {
            requiresRebind: false,
            requiresSync,
            localRevision: this.sessions.snapshot(leaseId, owner).revision,
          });
        } finally {
          doc.destroy();
        }
      });
    });
    handle("remote-cancel", async (event, leaseId: string, operationId: string) => {
      this.leaseOwner(event, leaseId);
      const binding = this.remoteViews.get(leaseId),
        key = binding?.key,
        pending = key && this.remote.get(key);
      if (!pending) throw new Error("白板远端会话未打开");
      const session = await pending;
      await session.cancel(operationId);
      return session.snapshot();
    });
    handle("drained", (event, requestId: string, error?: string) => {
      const owner = this.owner(event),
        waiter = this.waiters.get(requestId);
      if (waiter?.owner === owner) waiter.resolve(error);
    });
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
          this.remoteViews.delete(view.leaseId);
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
  private async pushLocal(session: DocumentSyncSession, local: Uint8Array): Promise<void> {
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
   * 服务端已关闭/已退出但本机未装完时，再次执行即只用已缓存的资源完成本机替换。
   */
  private async unshare(
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
    if (previous?.remoteDone && previous.roomId === binding.documentId) {
      const candidate =
        previous.candidate ??
        this.installation.state.installation(previous.operationId)?.plan.prepared.candidate;
      if (!candidate) throw new Error("结束共享的提交候选缺失，不能更换原内容");
      return this.finishUnshare(context, previous, Buffer.from(candidate, "base64"));
    }
    const job: WhiteboardUnshareJob = {
      operationId: request.operationId,
      mode: request.mode,
      serverUrl: binding.serverUrl,
      roomId: binding.documentId,
      missing: [],
    };
    const mode = job.remoteDone ? "detach" : request.mode;
    let confirmed: Uint8Array | undefined;
    let remoteKey: string | undefined;
    try {
      const { key, session } = await this.remoteSession(job.serverUrl, job.roomId);
      remoteKey = key;
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
      collaborationModule.documentAssets()
    );
    const client = collaborationModule.documentClient();
    if (mode === "close")
      await client.request(job.serverUrl, `/v1/documents/${job.roomId}/close`, "POST", {
        expectedRevision: job.revision,
      });
    else if (mode === "leave")
      await client.request(job.serverUrl, `/v1/documents/${job.roomId}/leave`, "POST", {});
    const submitted = {
      ...job,
      remoteDone: true,
      missing: prepared.missing,
      candidate: Buffer.from(prepared.candidate).toString("base64"),
    };
    store.set(jobKey, submitted);
    if (remoteKey) this.remote.delete(remoteKey);
    return this.finishUnshare(context, submitted, prepared.candidate);
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
    this.store.delete(`whiteboard-binding:${context.name}:${context.documentId}`);
    this.store.delete(`whiteboard-unshare:${context.name}:${context.documentId}`);
    return { missing: job.missing.length };
  }

  private readonly pendingUnshares = new Map<string, Promise<void>>();
  private async finishPendingUnshare(name: string, contentId: number) {
    const db = databaseModule.getDatabase(name);
    if (!db) throw new Error("资料库未连接");
    const page = db
      .prepare("SELECT document_id FROM whiteboard_document_pages WHERE content_id=?")
      .get(contentId) as { document_id: string } | undefined;
    if (!page) return;
    const key = `whiteboard-unshare:${name}:${page.document_id}`;
    const job = this.store.get<WhiteboardUnshareJob | null>(key, null);
    if (!job?.remoteDone) return;
    let pending = this.pendingUnshares.get(key);
    if (!pending) {
      pending = (async () => {
        const candidate =
          job.candidate ??
          this.installation.state.installation(job.operationId)?.plan.prepared.candidate;
        if (!candidate) throw new Error("结束共享的提交候选缺失，不能更换原内容");
        await this.finishUnshare(
          { db, name, documentId: page.document_id },
          job,
          Buffer.from(candidate, "base64")
        );
        this.transitionDrains.get(job.operationId)?.commit();
        this.clearTransition(job.operationId);
      })().finally(() => this.pendingUnshares.delete(key));
      this.pendingUnshares.set(key, pending);
    }
    await pending;
  }
  private clearTransition(operationId: string) {
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
  private async drain(scope: WhiteboardDrainScope) {
    this.drains.add(scope);
    await Promise.allSettled(
      [...this.preparing]
        .filter(
          entry =>
            (scope.windowId === undefined || scope.windowId === entry.owner) &&
            (!scope.databaseName || scope.databaseName === entry.databaseName)
        )
        .map(entry => entry.task)
    );
    const views = this.views(scope);
    let active = true;
    const cancellations: (() => void)[] = [];
    const resume = () => {
      for (const view of views) {
        try {
          this.sessions.seal(view.leaseId, view.owner, false);
        } catch {
          // 已消失的租约无需解封，其它视图仍需收到恢复通知。
        }
        const window = BrowserWindow.fromId(view.owner);
        if (window && !window.isDestroyed())
          window.webContents.send("whiteboard-document:resume", { leaseId: view.leaseId });
      }
    };
    try {
      await Promise.all(
        views.map(
          view =>
            new Promise<void>((resolve, reject) => {
              const requestId = randomUUID(),
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
                      this.sessions.seal(view.leaseId, view.owner, true);
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
            this.remoteViews.delete(view.leaseId);
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
export default new WhiteboardDocumentsModule();
