import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import * as Y from "yjs";
import {
  WhiteboardModel,
  DocumentWriteQueue,
  collectWhiteboardRelations,
  WHITEBOARD_LIMITS,
} from "@tau/collaboration";
import type {
  WhiteboardDocumentOpen,
  WhiteboardDocumentReceipt,
  WhiteboardDocumentEvent,
} from "@/types/whiteboard-document";
import { WhiteboardJournal, journalKey, type JournalDocument } from "./journal";
import { WhiteboardDocumentRepository, type WhiteboardRelationCounter } from "./repository";

interface Session {
  value: JournalDocument;
  model: WhiteboardModel;
  db: Database.Database;
  error?: string;
}
interface Lease {
  id: string;
  owner: number;
  viewId: string;
  key: string;
  pageId: string;
  seals: Set<string>;
}
export class WhiteboardDocumentSessions {
  private sessions = new Map<string, Session>();
  private opening = new Map<string, Promise<Session>>();
  private leases = new Map<string, Lease>();
  private queue = new DocumentWriteQueue(16 * 1024 * 1024);
  private pendingWrites = new Map<string, number>();
  private async run<T>(key: string, bytes: number, action: () => Promise<T>): Promise<T> {
    this.pendingWrites.set(key, (this.pendingWrites.get(key) ?? 0) + 1);
    try {
      return await this.queue.run(key, bytes, action);
    } finally {
      const count = (this.pendingWrites.get(key) ?? 1) - 1;
      if (count) this.pendingWrites.set(key, count);
      else this.pendingWrites.delete(key);
      this.evict(key);
    }
  }
  constructor(
    readonly journal: WhiteboardJournal,
    private readonly database: (name: string) => Database.Database | undefined,
    private readonly emit: (owner: number, event: WhiteboardDocumentEvent) => void = () => {},
    private readonly counts?: WhiteboardRelationCounter,
    private readonly projected: (databaseName: string, documentId: string) => void = () => {},
    private readonly blocked: (databaseName: string, documentId: string) => boolean = () => false
  ) {}
  private repository(name: string): WhiteboardDocumentRepository {
    const db = this.database(name);
    if (!db?.open) throw new Error("原数据库连接已关闭");
    return new WhiteboardDocumentRepository(db, name, this.counts);
  }
  private connection(session: Session): WhiteboardDocumentRepository {
    const repo = this.repository(session.value.databaseName);
    if (repo.db !== session.db) throw new Error("数据库连接代次已变化，旧会话禁止写入");
    const current = repo.read(session.value.documentId);
    if (
      !current ||
      current.sourceId !== session.value.sourceId ||
      current.baselineId !== session.value.baselineId ||
      current.epoch !== session.value.epoch
    )
      throw new Error("白板来源或代次已变化");
    return repo;
  }
  private receipt(session: Session): WhiteboardDocumentReceipt {
    return {
      revision: session.value.revision,
      projectedRevision: session.value.projectedRevision,
      ...(session.error ? { error: session.error } : {}),
    };
  }
  private project(session: Session): void {
    try {
      const previous = session.value.projectedRevision;
      this.connection(session).project(session.value, session.model);
      this.journal.markProjected(session.value);
      session.value = {
        ...session.value,
        projectedRevision: session.value.revision,
        projectedHash: session.value.hash,
      };
      session.error = undefined;
      if (previous < session.value.revision) {
        try {
          this.projected(session.value.databaseName, session.value.documentId);
        } catch {
          // 查询通知失败不能撤销已经提交的投影。
        }
      }
    } catch (error) {
      session.error = error instanceof Error ? error.message : String(error);
    }
  }
  private notify(session: Session, update?: Uint8Array): void {
    for (const owner of new Set(
      [...this.leases.values()]
        .filter(lease => lease.key === journalKey(session.value))
        .map(lease => lease.owner)
    )) {
      try {
        this.emit(owner, {
          databaseName: session.value.databaseName,
          documentId: session.value.documentId,
          sourceId: session.value.sourceId,
          baselineId: session.value.baselineId,
          epoch: session.value.epoch,
          ...this.receipt(session),
          ...(update ? { update } : {}),
        });
      } catch {
        /* 通知失败不能撤销已经耐久接纳的更新。 */
      }
    }
  }
  async create(
    databaseName: string,
    documentId: string,
    state: Uint8Array,
    owner: "board" | "standalone"
  ): Promise<{ documentId: string; boardId: number | null; contentIds: number[] }> {
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(documentId) ||
      !["board", "standalone"].includes(owner)
    )
      throw new Error("白板创建参数无效");
    const repo = this.repository(databaseName),
      doc = new Y.Doc({ gc: false }),
      model = new WhiteboardModel(doc);
    try {
      if ((await model.receive(new Uint8Array(state))).status !== "applied")
        throw new Error("白板基线缺少依赖");
      if (this.repository(databaseName).db !== repo.db) throw new Error("创建期间切换了数据库连接");
      const created = repo.create(documentId, model, owner);
      return {
        documentId,
        boardId: created.boardId,
        contentIds: (
          repo.db
            .prepare(
              "SELECT content_id FROM whiteboard_document_pages WHERE document_id=? AND visible=1 ORDER BY page_index"
            )
            .all(documentId) as { content_id: number }[]
        ).map(row => row.content_id),
      };
    } finally {
      model.dispose();
      doc.destroy();
    }
  }
  async open(
    databaseName: string,
    contentId: number,
    owner: number,
    viewId: string
  ): Promise<WhiteboardDocumentOpen> {
    if (
      !Number.isSafeInteger(contentId) ||
      contentId <= 0 ||
      typeof viewId !== "string" ||
      !viewId ||
      viewId.length > 128
    )
      throw new Error("白板会话目标无效");
    const repo = this.repository(databaseName),
      mapping = repo.byPage(contentId);
    if (!mapping) throw new Error("白板页面尚未接入文档会话");
    const key = journalKey(mapping.document);
    let session = this.sessions.get(key);
    if (!session) {
      let pending = this.opening.get(key);
      if (!pending) {
        pending = this.restore(repo, mapping.document);
        this.opening.set(key, pending);
      }
      try {
        session = await pending;
      } finally {
        if (this.opening.get(key) === pending) this.opening.delete(key);
      }
    }
    this.connection(session);
    const existing = [...this.leases.values()].find(
      lease => lease.owner === owner && lease.viewId === viewId
    );
    if (existing && existing.key !== key) throw new Error("视图身份不能跨文档复用");
    const lease = existing ?? {
      id: randomUUID(),
      owner,
      viewId,
      key,
      pageId: mapping.pageId,
      seals: new Set<string>(),
    };
    if (lease.seals.size) throw new Error("视图正在关闭或切库");
    lease.pageId = mapping.pageId;
    this.leases.set(lease.id, lease);
    return {
      identity: {
        databaseName,
        documentId: session.value.documentId,
        sourceId: session.value.sourceId,
        baselineId: session.value.baselineId,
        epoch: session.value.epoch,
      },
      leaseId: lease.id,
      pageId: lease.pageId,
      state: Y.encodeStateAsUpdate(session.model.doc),
      ...this.receipt(session),
    };
  }
  private async restore(
    repo: WhiteboardDocumentRepository,
    source: NonNullable<ReturnType<WhiteboardDocumentRepository["read"]>>
  ): Promise<Session> {
    if (this.blocked(source.databaseName, source.documentId))
      throw new Error("白板共享提交尚未完成，请重试");
    const key = journalKey(source),
      cached = this.journal.load(key);
    if (
      cached &&
      !(
        (source.revision === cached.projectedRevision && source.hash === cached.projectedHash) ||
        (source.revision === cached.revision && source.hash === cached.hash)
      )
    )
      throw new Error("主库快照与白板本机日志分叉，两个版本均已保留");
    if (cached && journalKey(cached) !== key) throw new Error("白板日志身份损坏，原材料已保留");
    const value = cached ?? {
      ...source,
      projectedRevision: source.revision,
      projectedHash: source.hash,
    };
    const doc = new Y.Doc({ gc: false }),
      model = new WhiteboardModel(doc);
    try {
      if ((await model.receive(value.state)).status !== "applied")
        throw new Error("白板日志缺少依赖，材料已保留");
      if (this.repository(source.databaseName).db !== repo.db)
        throw new Error("恢复期间数据库连接已变化");
      if (!cached)
        this.journal.seed(
          value,
          collectWhiteboardRelations(model, true).map(ref => ref.target)
        );
      const session: Session = { value, model, db: repo.db };
      this.project(session);
      this.sessions.set(key, session);
      return session;
    } catch (error) {
      model.dispose();
      doc.destroy();
      throw error;
    }
  }
  private require(
    leaseId: string,
    owner: number,
    write = false
  ): { lease: Lease; session: Session } {
    const lease = this.leases.get(leaseId),
      session = lease && this.sessions.get(lease.key);
    if (!lease || lease.owner !== owner || !session) throw new Error("白板会话持有已失效");
    if (write && this.blocked(session.value.databaseName, session.value.documentId))
      throw new Error("白板共享提交尚未完成，旧代次禁止写入");
    if (write && lease.seals.size) throw new Error("白板视图已完成关闭屏障");
    this.connection(session);
    return { lease, session };
  }
  async append(
    leaseId: string,
    owner: number,
    batchId: string,
    input: Uint8Array
  ): Promise<WhiteboardDocumentReceipt> {
    const { lease, session } = this.require(leaseId, owner, true);
    if (
      typeof batchId !== "string" ||
      !batchId ||
      batchId.length > 128 ||
      !(input instanceof Uint8Array) ||
      input.byteLength > WHITEBOARD_LIMITS.documentBytes
    )
      throw new Error("白板批次无效或超限");
    const update = new Uint8Array(input);
    return this.run(lease.key, update.byteLength, async () => {
      this.connection(session);
      if (this.blocked(session.value.databaseName, session.value.documentId))
        throw new Error("白板共享提交尚未完成");
      if (lease.seals.size) throw new Error("白板视图已经封存");
      if (this.journal.receipt(lease.key, batchId, update) !== null) {
        this.project(session);
        return this.receipt(session);
      }
      const doc = new Y.Doc({ gc: false });
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(session.model.doc));
      const candidate = new WhiteboardModel(doc);
      try {
        if ((await candidate.receive(update)).status !== "applied")
          throw new Error("MISSING_DEPENDENCIES: 请保留更新并补齐白板基线");
        this.connection(session);
        const state = Y.encodeStateAsUpdate(doc);
        const next = this.journal.append(
          session.value,
          batchId,
          update,
          state,
          collectWhiteboardRelations(candidate, true).map(ref => ref.target)
        );
        Y.applyUpdate(session.model.doc, update, "durable-main");
        session.value = next;
        this.project(session);
        this.notify(session, update);
        return this.receipt(session);
      } finally {
        candidate.dispose();
        doc.destroy();
      }
    });
  }
  async flush(leaseId: string, owner: number): Promise<WhiteboardDocumentReceipt> {
    const { lease, session } = this.require(leaseId, owner);
    return this.run(lease.key, 0, async () => {
      this.project(session);
      this.notify(session);
      if (session.error) throw new Error(session.error);
      return this.receipt(session);
    });
  }
  snapshot(leaseId: string, owner: number): WhiteboardDocumentOpen {
    const { lease, session } = this.require(leaseId, owner);
    return {
      identity: {
        databaseName: session.value.databaseName,
        documentId: session.value.documentId,
        sourceId: session.value.sourceId,
        baselineId: session.value.baselineId,
        epoch: session.value.epoch,
      },
      leaseId,
      pageId: lease.pageId,
      state: Y.encodeStateAsUpdate(session.model.doc),
      ...this.receipt(session),
    };
  }
  async release(leaseId: string, owner: number): Promise<void> {
    await this.flush(leaseId, owner);
    const { lease } = this.require(leaseId, owner);
    this.leases.delete(leaseId);
    this.evict(lease.key);
  }
  private evict(key: string): void {
    const session = this.sessions.get(key);
    if (
      session &&
      !this.pendingWrites.has(key) &&
      !session.error &&
      ![...this.leases.values()].some(lease => lease.key === key)
    ) {
      session.model.dispose();
      session.model.doc.destroy();
      this.sessions.delete(key);
    }
  }
  holders(
    filter: { owner?: number; databaseName?: string } = {}
  ): { leaseId: string; owner: number; databaseName: string }[] {
    return [...this.leases.values()]
      .filter(
        lease =>
          (filter.owner === undefined || lease.owner === filter.owner) &&
          (!filter.databaseName ||
            this.sessions.get(lease.key)?.value.databaseName === filter.databaseName)
      )
      .map(lease => ({
        leaseId: lease.id,
        owner: lease.owner,
        databaseName: this.sessions.get(lease.key)!.value.databaseName,
      }));
  }
  seal(leaseId: string, owner: number, requestId: string, sealed: boolean): void {
    const { lease } = this.require(leaseId, owner);
    if (sealed) lease.seals.add(requestId);
    else lease.seals.delete(requestId);
  }
  abandon(owner: number): void {
    for (const lease of [...this.leases.values()])
      if (lease.owner === owner) {
        this.leases.delete(lease.id);
        this.evict(lease.key);
      }
  }
  isActive(databaseName: string, documentId: string): boolean {
    return (
      [...this.sessions.values()].some(
        session =>
          session.value.databaseName === databaseName && session.value.documentId === documentId
      ) ||
      [...this.opening.keys()].some(key => {
        const identity = JSON.parse(key);
        return identity[0] === databaseName && identity[3] === documentId;
      })
    );
  }
  retire(databaseName: string, documentId: string): void {
    if (this.isActive(databaseName, documentId)) throw new Error("白板仍有活跃编辑，不能回收");
    const repo = this.repository(databaseName),
      stored = repo.read(documentId);
    if (!stored) return;
    const saved = this.journal.load(journalKey(stored));
    if (saved && (saved.hash !== stored.hash || saved.revision !== stored.revision))
      throw new Error("白板主库与日志不一致，不能回收");
    repo.db.transaction(() => {
      repo.retire(documentId);
      this.journal.retire(stored);
    })();
  }
  async flushDatabase(databaseName: string): Promise<void> {
    const repo = this.repository(databaseName);
    const rows = repo.db.prepare("SELECT document_id FROM whiteboard_documents").all() as {
      document_id: string;
    }[];
    for (const row of rows) {
      await this.flushDocument(databaseName, row.document_id);
    }
  }
  async flushDocument(databaseName: string, documentId: string): Promise<void> {
    const repo = this.repository(databaseName),
      stored = repo.read(documentId);
    if (!stored) throw new Error("白板文档已不存在");
    const key = journalKey(stored);
    await this.run(key, 0, async () => {
      let session = this.sessions.get(key);
      if (!session) {
        let pending = this.opening.get(key);
        if (!pending) {
          pending = this.restore(repo, stored);
          this.opening.set(key, pending);
        }
        try {
          session = await pending;
        } finally {
          if (this.opening.get(key) === pending) this.opening.delete(key);
        }
      }
      this.project(session);
      if (session.error) throw new Error(session.error);
      this.evict(key);
    });
  }
  async releaseDatabase(databaseName: string, owner?: number): Promise<void> {
    for (const view of this.holders({ databaseName, owner }))
      await this.release(view.leaseId, view.owner);
    for (const [key, session] of this.sessions)
      if (
        session.value.databaseName === databaseName &&
        ![...this.leases.values()].some(lease => lease.key === key)
      ) {
        this.project(session);
        if (session.error) throw new Error(session.error);
        this.evict(key);
      }
  }
  /** 资料库文件被整体替换前调用：先排空关库流程已完成，这里只释放旧库的内存会话与本机日志。 */
  releaseLibrary(databaseName: string): number {
    const owned = [...this.sessions].filter(
      ([, session]) => session.value.databaseName === databaseName
    );
    if (owned.some(([key]) => [...this.leases.values()].some(lease => lease.key === key)))
      throw new Error("白板仍在编辑，不能替换资料库");
    if (owned.some(([key]) => this.pendingWrites.has(key) || this.opening.has(key)))
      throw new Error("白板仍在保存，不能替换资料库");
    const released = this.journal.releaseLibrary(databaseName);
    for (const [key, session] of owned) {
      session.model.dispose();
      session.model.doc.destroy();
      this.sessions.delete(key);
    }
    return released;
  }
  detach(leaseId: string, owner: number): void {
    const lease = this.leases.get(leaseId);
    if (!lease || lease.owner !== owner) return;
    this.leases.delete(leaseId);
    this.evict(lease.key);
  }
  dispose(): void {
    for (const session of this.sessions.values()) {
      session.model.dispose();
      session.model.doc.destroy();
    }
    this.sessions.clear();
    this.leases.clear();
  }
}
