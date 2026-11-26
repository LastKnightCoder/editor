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
  list(
    databaseName: string,
    documentId: string,
    includeDatabaseAlias?: boolean
  ): Promise<PendingWhiteboardUpdate[]>;
  put(update: PendingWhiteboardUpdate): Promise<void>;
  remove(batchId: string): Promise<void>;
}
export interface WhiteboardDocumentBackend {
  open(target: WhiteboardDocumentTarget, viewId: string): Promise<WhiteboardDocumentOpen>;
  append(leaseId: string, batchId: string, update: Uint8Array): Promise<WhiteboardDocumentReceipt>;
  flush(leaseId: string): Promise<WhiteboardDocumentReceipt>;
  snapshot(leaseId: string): Promise<WhiteboardDocumentOpen>;
  release(leaseId: string, draftsDrained?: boolean): Promise<void>;
  events(listener: (event: WhiteboardDocumentEvent) => void): () => void;
  drains(listener: (event: WhiteboardDocumentFlushRequest) => void): () => void;
  resumes(listener: (event: WhiteboardDocumentResume) => void): () => void;
  detached?(listener: (leaseId: string) => void): () => void;
  drained(requestId: string, error?: string, offlineDraft?: Uint8Array): Promise<void>;
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

function earlierDraft(scope: string, opened: WhiteboardDocumentOpen) {
  try {
    const old: unknown = JSON.parse(scope);
    if (
      !Array.isArray(old) ||
      old.length !== 5 ||
      !Number.isSafeInteger(old[4]) ||
      old[4] < 0 ||
      old[4] >= opened.identity.epoch
    )
      return false;
    return JSON.stringify([...old.slice(0, 4), opened.identity.epoch]) === scopeOf(opened);
  } catch {
    return false;
  }
}

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
  private appending?: Uint8Array;
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
  private observedRevision = -1;
  private flushing?: Promise<void>;
  private persisted = new Map<string, Promise<void>>();
  private sequence = 0;
  private closed = false;
  private closingForReclaim = false;
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
          this.set({
            frozen: this.closingForReclaim || [...this.drains.values()].includes(event.leaseId),
          });
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
      const summary = this.model.readSummary();
      if (this.summary.title !== summary.title || this.summary.pageCount !== summary.pageCount)
        this.summary = summary;
    }
    this.state = { ...this.state, ...patch, pending: this.pending.length };
    for (const listener of this.listeners) listener();
  }
  private fail(error: unknown) {
    this.set({ phase: "error", error: error instanceof Error ? error.message : String(error) });
  }
  private async initialize(): Promise<void> {
    try {
      const opened = await this.backend.open(this.target, this.viewId);
      this.opened = opened;
      if ((await this.model.receive(opened.state)).status !== "applied")
        throw new Error("白板基线不完整");
      this.observedRevision = opened.revision;
      const drafts = await this.outbox.list(this.target.databaseName, opened.identity.documentId);
      const stored: PendingWhiteboardUpdate[] = [];
      const scope = scopeOf(opened);
      for (const draft of drafts) {
        if (draft.scope === scope) {
          stored.push(draft);
          continue;
        }
        if (
          this.doc.share.has("meta") &&
          this.doc.getMap("meta").get("version") === 3 &&
          earlierDraft(draft.scope, opened)
        )
          continue;
        throw new Error("发现另一基线的白板草稿，材料已保留，请先处理旧草稿");
      }
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
        revision: opened.revision,
        projectedRevision: opened.projectedRevision,
        error: opened.error,
        phase: this.pending.length ? "saving" : opened.error ? "error" : "saved",
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
    this.stage(update);
    void this.flush().catch(() => undefined);
  };
  private stage(update: Uint8Array): PendingWhiteboardUpdate {
    const opened = this.opened;
    if (!opened || this.closed || this.stale) throw new Error("白板视图已失效");
    const record: PendingWhiteboardUpdate = {
      batchId: crypto.randomUUID(),
      scope: scopeOf(opened),
      databaseName: this.target.databaseName,
      documentId: opened.identity.documentId,
      clientId: this.viewId,
      sequence: ++this.sequence,
      update: new Uint8Array(update),
    };
    this.pending.push(record);
    void this.persist(record).catch(error => this.fail(error));
    this.set({ phase: "saving", error: undefined });
    return record;
  }
  private persist(record: PendingWhiteboardUpdate): Promise<void> {
    const pending = this.persisted.get(record.batchId);
    if (pending) return pending;
    const writing = this.outbox.put(record).catch(error => {
      if (this.persisted.get(record.batchId) === writing) this.persisted.delete(record.batchId);
      throw error;
    });
    this.persisted.set(record.batchId, writing);
    return writing;
  }
  private async repairDependencies(opened: WhiteboardDocumentOpen): Promise<void> {
    const snapshot = await this.backend.snapshot(opened.leaseId);
    if (this.closed || this.stale || scopeOf(snapshot) !== scopeOf(opened))
      throw new Error("白板基线已变化，原草稿已保留，不能自动补齐");
    const update = Y.encodeStateAsUpdate(this.doc, Y.encodeStateVectorFromUpdate(snapshot.state));
    const record = this.stage(update);
    await this.persist(record);
    console.info("[whiteboard-sync] 缺失依赖已进入草稿队列", {
      documentId: opened.identity.documentId,
      viewId: this.viewId,
      batchId: record.batchId,
      bytes: update.byteLength,
      revision: snapshot.revision,
    });
  }
  private event(event: WhiteboardDocumentEvent): void {
    if (this.closed || this.stale || event.databaseName !== this.target.databaseName) return;
    if (!this.opened || !this.initialized) {
      this.incoming.push(event);
      return;
    }
    const opened = this.opened;
    const identity = opened.identity;
    if (
      event.documentId !== identity.documentId ||
      event.sourceId !== identity.sourceId ||
      event.baselineId !== identity.baselineId ||
      event.epoch !== identity.epoch
    )
      return;
    const sent = this.appending;
    const ownEcho =
      event.originViewId === this.viewId ||
      (sent !== undefined &&
        event.update?.length === sent.length &&
        event.update.every((byte, index) => byte === sent[index]));
    const receivedAt = performance.now();
    this.receiveTail = this.receiveTail
      .catch(() => undefined)
      .then(async () => {
        if (this.closed || this.stale) return;
        if (event.update) {
          // 主进程回播的本次原字节已在本机集成，仍按原次序处理修订回执。
          if (!ownEcho && (await this.model.receive(event.update)).status === "pending") {
            const snapshot = await this.backend.snapshot(opened.leaseId);
            if ((await this.model.receive(snapshot.state)).status !== "applied")
              throw new Error("白板增量缺少依赖，快照未能补齐");
          }
          this.observedRevision = Math.max(this.observedRevision, event.revision);
          console.info("[whiteboard-sync] 渲染端应用增量", {
            documentId: identity.documentId,
            revision: event.revision,
            bytes: event.update.byteLength,
            elapsedMs: Math.round(performance.now() - receivedAt),
          });
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
  /** 查询与写回执紧邻时，先等同一份增量进入视图；漏收广播才补取检查点。 */
  async observeRevision(revision: number) {
    await this.receiveTail;
    if (this.observedRevision >= revision) return;
    const lease = this.leaseId;
    if (!lease || this.closed || this.stale) throw new Error("白板视图已关闭");
    const task = this.receiveTail.then(async () => {
      if (this.observedRevision >= revision) return;
      const snapshot = await this.backend.snapshot(lease);
      if (this.closed || this.stale || !this.opened || scopeOf(snapshot) !== scopeOf(this.opened))
        throw new Error("白板视图已失效");
      if (
        snapshot.revision < revision ||
        (await this.model.receive(snapshot.state)).status !== "applied"
      )
        throw new Error("白板同步尚未完成");
      this.observedRevision = snapshot.revision;
      this.set({ revision: snapshot.revision, projectedRevision: snapshot.projectedRevision });
    });
    this.receiveTail = task.catch(error => this.fail(error));
    await task;
  }
  async flush(): Promise<void> {
    await this.ready;
    if (this.closed) throw new Error("白板会话已关闭");
    const opened = this.opened;
    if (!opened) throw new Error("白板会话未打开");
    if (!this.state.frozen) this.flushInputs();
    if (this.flushing) return this.flushing;
    const run = async () => {
      let repaired = false;
      try {
        for (;;) {
          while (this.pending.length) {
            const records = this.pending.slice();
            for (const record of records) await this.persist(record);
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
            const started = performance.now();
            this.appending = update;
            let receipt: WhiteboardDocumentReceipt;
            try {
              receipt = await this.backend.append(opened.leaseId, batchId, update);
            } catch (error) {
              if (
                !repaired &&
                error instanceof Error &&
                /\bMISSING_DEPENDENCIES:/.test(error.message)
              ) {
                repaired = true;
                await this.repairDependencies(opened);
                continue;
              }
              throw error;
            } finally {
              this.appending = undefined;
            }
            console.info("[whiteboard-sync] 本机耐久保存完成", {
              documentId: opened.identity.documentId,
              batchId,
              bytes: update.byteLength,
              revision: receipt.revision,
              elapsedMs: Math.round(performance.now() - started),
            });
            for (const record of records) {
              await this.outbox.remove(record.batchId);
              this.persisted.delete(record.batchId);
            }
            this.pending.splice(0, records.length);
            this.set(receipt);
            if (receipt.error) throw new Error(receipt.error);
          }
          await this.receiveTail;
          const receipt = await this.backend.flush(opened.leaseId);
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
        console.error("[whiteboard-sync] 本机保存未完成", {
          documentId: opened.identity.documentId,
          viewId: this.viewId,
          revision: this.state.revision,
          pending: this.pending.length,
          repaired,
          error: error instanceof Error ? error.message : String(error),
        });
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
        let reason = error;
        if (event.recoverOffline && this.state.frozen && this.pending.length) {
          try {
            await this.preservePending();
            if (!this.drains.has(event.requestId) || this.closed || this.stale) return;
            const draft = Y.mergeUpdates(this.pending.map(record => record.update));
            await this.backend.drained(event.requestId, undefined, draft);
            return;
          } catch (failure) {
            reason = failure;
          }
        }
        this.fail(reason);
        await this.backend
          .drained(event.requestId, reason instanceof Error ? reason.message : String(reason))
          .catch(() => undefined);
      }
    }
  }
  async release(): Promise<void> {
    if (this.closed) return;
    try {
      if (!this.stale) await this.flush();
      if (!this.stale) {
        const opened = this.opened;
        if (!opened) throw new Error("白板会话未打开");
        let draftsDrained = false;
        if (this.state.checkDraftsOnRelease) {
          if (!this.state.frozen) this.flushInputs();
          this.closingForReclaim = true;
          this.set({ frozen: true });
          if (this.pending.length) await this.flush();
          try {
            const drafts = await this.outbox.list(
              this.target.databaseName,
              opened.identity.documentId,
              true
            );
            draftsDrained = !drafts.length && !this.pending.length;
          } catch {
            // 不能证明其他窗口的草稿已落盘时继续正常关闭，下次再清理。
          }
        }
        if (this.pending.length) {
          draftsDrained = false;
          await this.flush();
        }
        await this.backend.release(opened.leaseId, draftsDrained);
      }
    } catch (error) {
      if (!this.stale) {
        if (this.closingForReclaim) {
          this.closingForReclaim = false;
          this.set({
            frozen:
              this.opened !== undefined && [...this.drains.values()].includes(this.opened.leaseId),
          });
        }
        throw error;
      }
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
