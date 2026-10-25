import * as Y from "yjs";
import { CollaborationError } from "./protocol";
import { validateStructuredDocument } from "./document-adapter";
import { DocumentWriteQueue } from "./document-write-queue";
import type { MigrationDocument } from "./document-migration";
import type { DocumentOperation, DocumentOperationRequest } from "./document-operations";

export interface ConfirmedDocument {
  state: Uint8Array;
  protocol: MigrationDocument & { sequence: number };
}
export interface PendingDocumentOperation {
  request: DocumentOperationRequest;
  update: Uint8Array;
}
export interface DocumentSyncState {
  confirmed: ConfirmedDocument;
  pending: PendingDocumentOperation[];
  rejected: {
    reason: string;
    baseline: ConfirmedDocument;
    operations: PendingDocumentOperation[];
    state: Uint8Array;
  }[];
  receipts: DocumentOperation[];
  blocked: boolean;
}
export interface DocumentSyncJournal {
  load(): Promise<DocumentSyncState | null>;
  save(state: DocumentSyncState): Promise<void>;
}
export interface DocumentSyncTransport {
  /** 最近一次服务端响应的时间；HTTP 宿主消费标准 Date，不推断客户端墙钟偏移。 */
  now?(): number;
  read(): Promise<ConfirmedDocument>;
  /** 只读确认摘要与序号；提供时，远端未变化的刷新不下载完整状态。 */
  peek?(): Promise<ConfirmedDocument["protocol"]>;
  submit(request: DocumentOperationRequest, update: Uint8Array): Promise<DocumentOperation>;
  receipt(operationId: string): Promise<DocumentOperation | null>;
  cancel(request: DocumentOperationRequest): Promise<DocumentOperation>;
}
const digest = async (bytes: Uint8Array) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes)))]
    .map(x => x.toString(16).padStart(2, "0"))
    .join("");
const sameBaseline = (left: MigrationDocument, right: MigrationDocument) =>
  left.id === right.id &&
  left.epoch === right.epoch &&
  left.version === right.version &&
  left.baselineId === right.baselineId;

/** 不把未确认分支并入新基线；恢复材料落盘成功以前不清队列、不安装另一代次。 */
export class DocumentSyncSession {
  private state!: DocumentSyncState;
  private readonly queue = new DocumentWriteQueue(16 * 1024 * 1024);
  private constructor(
    readonly documentId: string,
    private readonly journal: DocumentSyncJournal,
    private readonly transport: DocumentSyncTransport
  ) {}
  static async open(
    documentId: string,
    journal: DocumentSyncJournal,
    transport: DocumentSyncTransport
  ): Promise<DocumentSyncSession> {
    const session = new DocumentSyncSession(documentId, journal, transport);
    const saved = await journal.load();
    if (saved) {
      await session.check(saved.confirmed);
      session.state = saved;
      if (saved.receipts.some(receipt => "update" in receipt || "baseline" in receipt)) {
        const receipts = saved.receipts.map(receipt => {
          const {
            update: _update,
            baseline: _baseline,
            ...operation
          } = receipt as DocumentOperation & { update?: Uint8Array; baseline?: ConfirmedDocument };
          return operation;
        });
        await session.persist({ ...saved, receipts });
      }
    } else {
      const confirmed = await transport.read();
      await session.check(confirmed);
      session.state = { confirmed, pending: [], rejected: [], receipts: [], blocked: false };
      await session.persist(session.state);
    }
    return session;
  }
  snapshot(): DocumentSyncState {
    return structuredClone(this.state);
  }
  private async check(value: ConfirmedDocument) {
    if (
      value.protocol.id !== this.documentId ||
      !Number.isSafeInteger(value.protocol.sequence) ||
      value.protocol.sequence < 0 ||
      (await digest(value.state)) !== value.protocol.revision
    )
      throw new CollaborationError("BASELINE_CONFLICT", "服务端快照与回执身份不匹配", 409);
    const doc = new Y.Doc({ gc: false });
    try {
      Y.applyUpdate(doc, value.state);
      if (doc.getMap("meta").get("version") !== value.protocol.version)
        throw new CollaborationError("BASELINE_CONFLICT", "快照协议与回执不匹配", 409);
      await validateStructuredDocument(doc, {
        documentId: this.documentId,
        epoch: value.protocol.epoch,
        baselineId: value.protocol.baselineId!,
      });
    } finally {
      doc.destroy();
    }
  }
  private async persist(state: DocumentSyncState) {
    await this.journal.save(structuredClone(state));
    this.state = state;
  }
  stage(
    update: Uint8Array,
    condition?: { revision: string; sequence: number },
    operationId: string = crypto.randomUUID()
  ): Promise<string> {
    const copy = Uint8Array.from(update);
    return this.queue.run(this.documentId, copy.byteLength, async () => {
      const updateHash = await digest(copy);
      const existing =
        this.state.pending.find(item => item.request.operationId === operationId)?.request ??
        this.state.receipts.find(item => item.operationId === operationId);
      if (existing) {
        if (
          existing.updateHash === updateHash &&
          existing.expectedRevision === condition?.revision &&
          existing.expectedSequence === condition?.sequence
        )
          return operationId;
        throw new CollaborationError(
          "OPERATION_IDENTITY_CONFLICT",
          "同一操作不能更换候选或条件",
          409
        );
      }
      if (this.state.blocked || (condition && this.state.pending.length))
        throw new CollaborationError("PENDING_OPERATION", "请先处理待确认或隔离分支", 409);
      if (
        copy.byteLength > 8 * 1024 * 1024 ||
        copy.byteLength + this.state.pending.reduce((n, item) => n + item.update.byteLength, 0) >
          16 * 1024 * 1024
      )
        throw new CollaborationError("CAPACITY", "待确认编辑超过本机队列预算", 429);
      if (
        !/^[A-Za-z0-9._-]{1,128}$/.test(operationId) ||
        this.state.rejected.some(branch =>
          branch.operations.some(item => item.request.operationId === operationId)
        )
      )
        throw new CollaborationError(
          "OPERATION_IDENTITY_CONFLICT",
          "本机操作身份已存在或无效",
          409
        );
      const { protocol } = this.state.confirmed;
      const request: DocumentOperationRequest = {
        operationId,
        epoch: protocol.epoch,
        baselineId: protocol.baselineId!,
        version: protocol.version,
        updateHash,
        expiresAt: (this.transport.now?.() ?? Date.now()) + 5 * 60_000,
        ...(condition
          ? { expectedRevision: condition.revision, expectedSequence: condition.sequence }
          : {}),
      };
      await this.persist({
        ...this.state,
        pending: [...this.state.pending, { request, update: copy }],
      });
      return request.operationId;
    });
  }
  private async isolate(reason: string, preserveBaseline = false) {
    if (!this.state.pending.length && !preserveBaseline) return;
    let retained = this.state.confirmed.state;
    try {
      retained = Y.mergeUpdates([retained, ...this.state.pending.map(item => item.update)]);
    } catch {
      /* 损坏增量仍以原始字节保留，不能阻断分支隔离。 */
    }
    await this.persist({
      ...this.state,
      blocked: true,
      pending: [],
      rejected: [
        ...this.state.rejected,
        {
          reason,
          baseline: this.state.confirmed,
          operations: this.state.pending,
          state: retained,
        },
      ],
    });
  }
  private async refresh() {
    if (this.transport.peek) {
      const head = await this.transport.peek(),
        current = this.state.confirmed.protocol;
      if (
        sameBaseline(head, current) &&
        head.revision === current.revision &&
        head.sequence === current.sequence
      )
        return;
    }
    const confirmed = await this.transport.read();
    await this.check(confirmed);
    const before = this.state.confirmed.protocol,
      after = confirmed.protocol;
    if (
      after.version !== before.version ||
      after.epoch < before.epoch ||
      (after.epoch === before.epoch && after.baselineId !== before.baselineId) ||
      (sameBaseline(before, after) &&
        (after.sequence < before.sequence ||
          (after.sequence === before.sequence && after.revision !== before.revision)))
    )
      throw new CollaborationError(
        "BASELINE_CONFLICT",
        "确认基线发生回退或分叉，原材料已保留",
        409
      );
    if (!sameBaseline(this.state.confirmed.protocol, confirmed.protocol))
      await this.isolate("EPOCH_CONFLICT", true);
    await this.persist({ ...this.state, confirmed });
  }
  synchronize(): Promise<void> {
    return this.queue.run(this.documentId, 0, () => this.refresh());
  }
  /** 调用方必须丢弃旧可写副本并使用返回的确认快照；原分支仍保留在日志中。 */
  restartFromConfirmed(): Promise<ConfirmedDocument> {
    return this.queue.run(this.documentId, 0, async () => {
      if (this.state.pending.length)
        throw new CollaborationError("PENDING_OPERATION", "仍有结果未知的提案，不能重建副本", 409);
      await this.refresh();
      await this.persist({ ...this.state, blocked: false });
      return structuredClone(this.state.confirmed);
    });
  }
  flush(): Promise<void> {
    return this.queue.run(this.documentId, 0, async () => {
      if (this.state.blocked)
        throw new CollaborationError("BRANCH_RETAINED", "请显式从确认快照新建副本后继续", 409);
      let renewed = false;
      while (this.state.pending.length) {
        const first = this.state.pending[0];
        let operation = await this.transport.receipt(first.request.operationId);
        if (!operation || operation.state === "PENDING")
          operation = await this.transport.submit(first.request, first.update);
        if (
          operation.documentId !== this.documentId ||
          operation.operationId !== first.request.operationId ||
          operation.epoch !== first.request.epoch ||
          operation.baselineId !== first.request.baselineId ||
          operation.updateHash !== first.request.updateHash
        )
          throw new CollaborationError(
            "OPERATION_IDENTITY_CONFLICT",
            "服务端操作回执与本机提案不匹配",
            409
          );
        if (operation.state === "PENDING")
          throw new CollaborationError("PENDING_OPERATION", "编辑仍待确认，请保留提案", 409);
        if (
          operation.state === "EXPIRED" &&
          first.request.expectedRevision === undefined &&
          first.request.expectedSequence === undefined
        ) {
          if (renewed)
            throw new CollaborationError(
              "PENDING_OPERATION",
              "操作再次过期，保留输入并稍后重试",
              409
            );
          await this.refresh();
          const current = this.state.confirmed.protocol;
          if (
            !this.state.blocked &&
            current.epoch === first.request.epoch &&
            current.baselineId === first.request.baselineId &&
            current.version === first.request.version
          ) {
            await this.persist({
              ...this.state,
              pending: [
                {
                  ...first,
                  request: {
                    ...first.request,
                    operationId: crypto.randomUUID(),
                    expiresAt: (this.transport.now?.() ?? Date.now()) + 5 * 60_000,
                  },
                },
                ...this.state.pending.slice(1),
              ],
            });
            renewed = true;
            continue;
          }
          throw new CollaborationError("BRANCH_RETAINED", "基线已变化，旧增量已保留", 409);
        }
        if (operation.state !== "COMMITTED") {
          await this.isolate(operation.reason ?? operation.state);
          await this.refresh();
          throw new CollaborationError(
            "BRANCH_RETAINED",
            "被拒分支已独立保全，请从确认基线恢复编辑",
            409
          );
        }
        if (
          !operation.receipt ||
          operation.receipt.documentId !== this.documentId ||
          operation.receipt.epoch !== first.request.epoch ||
          operation.receipt.baselineId !== first.request.baselineId
        )
          throw new CollaborationError("OPERATION_IDENTITY_CONFLICT", "缺少匹配的耐久回执", 409);
        // 先保存终态并移出发送队列；随后读取的快照若已换代，也不会重发已确认内容。
        await this.persist({
          ...this.state,
          pending: this.state.pending.slice(1),
          receipts: [...this.state.receipts, operation],
        });
        renewed = false;
        await this.refresh();
      }
    });
  }
  cancel(operationId: string): Promise<void> {
    return this.queue.run(this.documentId, 0, async () => {
      const operation = this.state.pending.find(item => item.request.operationId === operationId);
      if (!operation) return;
      if (operation !== this.state.pending[0])
        throw new CollaborationError("PENDING_OPERATION", "请先解决前序操作的未知结果", 409);
      const result = await this.transport.cancel(operation.request);
      if (
        result.documentId !== this.documentId ||
        result.operationId !== operation.request.operationId ||
        result.updateHash !== operation.request.updateHash ||
        result.epoch !== operation.request.epoch ||
        result.baselineId !== operation.request.baselineId
      )
        throw new CollaborationError("OPERATION_IDENTITY_CONFLICT", "取消回执身份不匹配", 409);
      if (result.state === "PENDING")
        throw new CollaborationError("PENDING_OPERATION", "取消尚未确认", 409);
      if (result.state === "COMMITTED")
        throw new CollaborationError("ALREADY_COMMITTED", "操作已提交，请读取回执后处理", 409);
      await this.isolate("cancelled");
      await this.refresh();
    });
  }
}
