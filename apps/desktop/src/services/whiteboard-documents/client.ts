import * as Y from "yjs";
import { WhiteboardModel } from "@tau/collaboration";
import type {
  WhiteboardDocumentOpen,
  WhiteboardDocumentReceipt,
  WhiteboardDocumentEvent,
  WhiteboardDocumentFlushRequest,
  WhiteboardDocumentTarget,
  WhiteboardDocumentResume,
} from "@/types/whiteboard-document";
export interface PendingWhiteboardUpdate {
  batchId: string;
  scope: string;
  databaseName: string;
  documentId: string;
  clientId: string;
  sequence: number;
  update: Uint8Array;
}
export interface WhiteboardOutbox {
  list(databaseName: string, documentId: string): Promise<PendingWhiteboardUpdate[]>;
  put(update: PendingWhiteboardUpdate): Promise<void>;
  remove(batchId: string): Promise<void>;
}
export interface WhiteboardDocumentBackend {
  open(target: WhiteboardDocumentTarget, viewId: string): Promise<WhiteboardDocumentOpen>;
  append(leaseId: string, batchId: string, update: Uint8Array): Promise<WhiteboardDocumentReceipt>;
  flush(leaseId: string): Promise<WhiteboardDocumentReceipt>;
  snapshot(leaseId: string): Promise<WhiteboardDocumentOpen>;
  release(leaseId: string): Promise<void>;
  events(listener: (event: WhiteboardDocumentEvent) => void): () => void;
  drains(listener: (event: WhiteboardDocumentFlushRequest) => void): () => void;
  resumes(listener: (event: WhiteboardDocumentResume) => void): () => void;
  detached?(listener: (leaseId: string) => void): () => void;
  drained(requestId: string, error?: string): Promise<void>;
}
export interface WhiteboardSaveState extends WhiteboardDocumentReceipt {
  phase: "loading" | "saving" | "saved" | "error";
  frozen: boolean;
  pending: number;
}
const scopeOf = (opened: WhiteboardDocumentOpen) =>
  JSON.stringify([
    opened.identity.databaseName,
    opened.identity.documentId,
    opened.identity.sourceId,
    opened.identity.baselineId,
    opened.identity.epoch,
  ]);

/** 会话可独立于 React 组件存活；没有耐久回执的批次一直留在 outbox 或内存。 */
export class WhiteboardDocumentClient {
  readonly doc = new Y.Doc({ gc: false });
  readonly model = new WhiteboardModel(this.doc);
  readonly viewId = crypto.randomUUID();
  readonly ready: Promise<void>;
  private opened?: WhiteboardDocumentOpen;
  private state: WhiteboardSaveState = {
    phase: "loading",
    frozen: false,
    pending: 0,
    revision: 0,
    projectedRevision: 0,
  };
  private summary = { title: "", pageCount: 0 };
  getSummary = () => this.summary;
  private inputFlushers = new Set<() => void>();
  private flushingInputs = false;
  registerInputFlush(flush: () => void): () => void {
    this.inputFlushers.add(flush);
    return () => {
      this.inputFlushers.delete(flush);
    };
  }
  private flushInputs(): void {
    if (this.flushingInputs) return;
    this.flushingInputs = true;
    try {
      for (const flush of this.inputFlushers) flush();
    } finally {
      this.flushingInputs = false;
    }
  }
  private listeners = new Set<() => void>();
  private pending: PendingWhiteboardUpdate[] = [];
  private incoming: WhiteboardDocumentEvent[] = [];
  private receiveTail = Promise.resolve();
  private flushing?: Promise<void>;
  private persisted = new Map<string, Promise<void>>();
  private sequence = 0;
  private closed = false;
  private modelHolders = 0;
  private modelDisposed = false;
  /** 会话关闭后，已挂载的画布仍需读取模型，直到 React 完成替换与清理。 */
  retainModel(): () => void {
    if (this.modelDisposed) throw new Error("白板文档已释放");
    this.modelHolders++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.modelHolders--;
      queueMicrotask(() => this.disposeModelIfIdle());
    };
  }
  private disposeModelIfIdle(): void {
    if (!this.closed || this.modelHolders || this.modelDisposed) return;
    this.modelDisposed = true;
    this.model.dispose();
    this.doc.destroy();
  }
  private initialized = false;
  private stale = false;
  private drains = new Map<string, string>();
  private cleanup: (() => void)[] = [];
  constructor(
    readonly target: WhiteboardDocumentTarget,
    private readonly backend: WhiteboardDocumentBackend,
    private readonly outbox: WhiteboardOutbox
  ) {
    this.cleanup.push(
      backend.events(event => this.event(event)),
      backend.drains(event => {
        void this.drain(event);
      }),
      backend.resumes(event => {
        if (this.drains.get(event.requestId) !== event.leaseId) return;
        this.drains.delete(event.requestId);
        if (this.opened?.leaseId === event.leaseId && !this.stale)
          this.set({ frozen: [...this.drains.values()].includes(event.leaseId) });
      })
    );
    if (backend.detached)
      this.cleanup.push(
        backend.detached(leaseId => {
          if (this.opened?.leaseId === leaseId) {
            this.stale = true;
            this.set({ frozen: true });
          }
        })
      );
    this.ready = this.initialize();
  }
  get needsReopen() {
    return this.stale;
  }
  async preservePending(): Promise<void> {
    await Promise.all(this.pending.map(record => this.outbox.put(record)));
  }
  get isDisposed() {
    return this.closed;
  }
  get leaseId() {
    return this.opened?.leaseId;
  }
  get identity() {
    return this.opened?.identity;
  }
  get pageId() {
    return this.opened?.pageId;
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private set(patch: Partial<WhiteboardSaveState>) {
    if (
      this.opened &&
      !this.closed &&
      (this.initialized || patch.phase === "saved" || patch.phase === "saving")
    ) {
      const snapshot = this.model.read();
      if (this.summary.title !== snapshot.title || this.summary.pageCount !== snapshot.pages.length)
        this.summary = { title: snapshot.title, pageCount: snapshot.pages.length };
    }
    this.state = { ...this.state, ...patch, pending: this.pending.length };
    for (const listener of this.listeners) listener();
  }
  private fail(error: unknown) {
    this.set({ phase: "error", error: error instanceof Error ? error.message : String(error) });
  }
  private async initialize(): Promise<void> {
    try {
      this.opened = await this.backend.open(this.target, this.viewId);
      if ((await this.model.receive(this.opened.state)).status !== "applied")
        throw new Error("白板基线不完整");
      const stored = await this.outbox.list(
        this.target.databaseName,
        this.opened.identity.documentId
      );
      if (stored.some(update => update.scope !== scopeOf(this.opened!)))
        throw new Error("发现另一基线的白板草稿，材料已保留，请先处理旧草稿");
      if (stored.length) {
        if (
          (await this.model.receive(Y.mergeUpdates(stored.map(record => record.update)))).status !==
          "applied"
        )
          throw new Error("白板恢复草稿缺少依赖，不能丢弃");
        this.pending.push(...stored);
      }
      this.doc.on("update", this.local);
      this.set({
        revision: this.opened.revision,
        projectedRevision: this.opened.projectedRevision,
        error: this.opened.error,
        phase: this.pending.length ? "saving" : this.opened.error ? "error" : "saved",
      });
      this.initialized = true;
      for (const event of this.incoming.splice(0)) this.event(event);
      if (this.pending.length)
        queueMicrotask(() => {
          void this.flush().catch(() => undefined);
        });
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }
  private readonly local = (
    update: Uint8Array,
    _origin: unknown,
    _doc: Y.Doc,
    transaction: Y.Transaction
  ) => {
    if (!transaction.local || this.closed || !this.opened) return;
    const record: PendingWhiteboardUpdate = {
      batchId: crypto.randomUUID(),
      scope: scopeOf(this.opened),
      databaseName: this.target.databaseName,
      documentId: this.opened.identity.documentId,
      clientId: this.viewId,
      sequence: ++this.sequence,
      update: new Uint8Array(update),
    };
    this.pending.push(record);
    const writing = this.outbox.put(record);
    this.persisted.set(record.batchId, writing);
    void writing.catch(error => this.fail(error));
    this.set({ phase: "saving", error: undefined });
    void this.flush().catch(() => undefined);
  };
  private event(event: WhiteboardDocumentEvent): void {
    if (this.closed || this.stale || event.databaseName !== this.target.databaseName) return;
    if (!this.opened || !this.initialized) {
      this.incoming.push(event);
      return;
    }
    const identity = this.opened.identity;
    if (
      event.documentId !== identity.documentId ||
      event.sourceId !== identity.sourceId ||
      event.baselineId !== identity.baselineId ||
      event.epoch !== identity.epoch
    )
      return;
    this.receiveTail = this.receiveTail
      .catch(() => undefined)
      .then(async () => {
        if (this.closed || this.stale) return;
        if (event.update) {
          const result = await this.model.receive(event.update);
          if (result.status === "pending") {
            const snapshot = await this.backend.snapshot(this.opened!.leaseId);
            await this.model.receive(snapshot.state);
          }
        }
        if (event.revision >= this.state.revision)
          this.set({
            revision: event.revision,
            projectedRevision: event.projectedRevision,
            ...(event.error ? { error: event.error, phase: "error" as const } : {}),
          });
      })
      .catch(error => this.fail(error));
  }
  async flush(): Promise<void> {
    await this.ready;
    if (this.closed) throw new Error("白板会话已关闭");
    if (!this.state.frozen) this.flushInputs();
    if (this.flushing) return this.flushing;
    const run = async () => {
      try {
        for (;;) {
          while (this.pending.length) {
            const records = this.pending.slice();
            for (const record of records) {
              const staged = this.persisted.get(record.batchId);
              try {
                if (staged) await staged;
                else await this.outbox.put(record);
              } catch (error) {
                this.persisted.delete(record.batchId);
                throw error;
              }
            }
            const update =
              records.length === 1
                ? records[0].update
                : Y.mergeUpdates(records.map(record => record.update));
            const batchId =
              records.length === 1
                ? records[0].batchId
                : "merged:" +
                  [
                    ...new Uint8Array(
                      await crypto.subtle.digest("SHA-256", Uint8Array.from(update))
                    ),
                  ]
                    .map(value => value.toString(16).padStart(2, "0"))
                    .join("");
            const receipt = await this.backend.append(this.opened!.leaseId, batchId, update);
            for (const record of records) {
              await this.outbox.remove(record.batchId);
              this.persisted.delete(record.batchId);
            }
            this.pending.splice(0, records.length);
            this.set(receipt);
            if (receipt.error) throw new Error(receipt.error);
          }
          await this.receiveTail;
          const receipt = await this.backend.flush(this.opened!.leaseId);
          if (receipt.error || receipt.projectedRevision < receipt.revision)
            throw new Error(receipt.error || "白板投影尚未完成");
          this.set({
            ...receipt,
            phase: this.pending.length ? "saving" : "saved",
            error: undefined,
          });
          if (!this.pending.length) break;
        }
      } catch (error) {
        this.fail(error);
        throw error;
      }
    };
    this.flushing = run();
    try {
      await this.flushing;
    } finally {
      this.flushing = undefined;
    }
    if (this.pending.length) await this.flush();
  }
  private async drain(event: WhiteboardDocumentFlushRequest): Promise<void> {
    if (this.closed || this.stale) return;
    this.drains.set(event.requestId, event.leaseId);
    try {
      await this.ready;
      if (!this.drains.has(event.requestId) || this.closed || this.stale) return;
      if (event.leaseId !== this.opened?.leaseId) {
        this.drains.delete(event.requestId);
        return;
      }
      this.flushInputs();
      this.set({ frozen: true });
      await this.flush();
      if (this.drains.has(event.requestId) && !this.closed && !this.stale)
        await this.backend.drained(event.requestId);
    } catch (error) {
      if (this.drains.has(event.requestId) && event.leaseId === this.opened?.leaseId) {
        this.fail(error);
        await this.backend
          .drained(event.requestId, error instanceof Error ? error.message : String(error))
          .catch(() => undefined);
      }
    }
  }
  async release(): Promise<void> {
    if (this.closed) return;
    try {
      if (!this.stale) await this.flush();
      if (!this.stale) await this.backend.release(this.opened!.leaseId);
    } catch (error) {
      if (!this.stale) throw error;
    }
    if (this.stale) await this.preservePending();
    this.dispose();
  }
  /** 只用于进程终止模拟或已经完成持久化的释放，不把它当作保存。 */
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.cleanup.splice(0).forEach(fn => fn());
    this.doc.off("update", this.local);
    this.disposeModelIfIdle();
    this.inputFlushers.clear();
    this.drains.clear();
    this.listeners.clear();
  }
}
