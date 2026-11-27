import * as Y from "yjs";
import type { WhiteboardModel, WhiteboardModelCommand } from "@tau/collaboration";
import { applyCandidate, type Candidate } from "./transaction";

interface Receipt {
  candidate: Candidate;
  revision: number;
  roots: number;
  allowed: () => boolean;
  roundTripMs: number;
  handoff?: ReturnType<WhiteboardModel["capturePreparedUpdate"]>;
  commands: readonly WhiteboardModelCommand[];
  mainPreparationMs: number;
}

export class FrameWorkerPrototype {
  private worker = new Worker(new URL("./prepare.worker.ts", import.meta.url), { type: "module" });
  private revision = 0;
  private sequence = 0;
  private closed = false;
  private requests = new Map<
    number,
    { resolve(value: Candidate): void; reject(error: Error): void }
  >();
  private receipts = new WeakSet<Receipt>();
  readonly ready: Promise<unknown>;
  private committing?: readonly WhiteboardModelCommand[];

  constructor(
    private model: WhiteboardModel,
    readonly proofHandoff = false,
    readonly incremental = false
  ) {
    this.worker.onmessage = ({ data }) => {
      if (data.id === null && !data.ok) {
        this.dispose(new Error(data.error));
        return;
      }
      const request = this.requests.get(data.id);
      if (!request) return;
      this.requests.delete(data.id);
      if (data.ok) request.resolve(data.candidate);
      else request.reject(new Error(data.error));
    };
    this.worker.onerror = event => this.dispose(new Error(event.message));
    this.ready = this.request({
      type: "init",
      update: Y.encodeStateAsUpdate(model.doc),
      roots: this.roots(),
      incremental,
    });
    model.doc.on("afterTransaction", this.changed);
    model.doc.on("update", this.sync);
    model.doc.on("destroy", this.destroyed);
  }

  private roots() {
    return [...this.model.doc.share.keys()].filter(
      name => name === "node-tree:nodes" || /^node-tree:roots:.*:nodes$/.test(name)
    );
  }
  private changed = (transaction: Y.Transaction) => {
    if (
      transaction.changed.size ||
      transaction.deleteSet.clients.size ||
      transaction.afterState.size !== transaction.beforeState.size ||
      [...transaction.afterState].some(
        ([client, clock]) => transaction.beforeState.get(client) !== clock
      )
    )
      this.revision++;
  };
  private destroyed = () => this.dispose();
  private sync = (update: Uint8Array) => {
    this.worker.postMessage({
      type: "sync",
      update,
      roots: this.roots(),
      ...(this.incremental && this.committing ? { commands: this.committing } : {}),
    });
  };
  private request(data: object): Promise<Candidate> {
    if (this.closed) return Promise.reject(new Error("后台准备器已关闭"));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.requests.set(id, { resolve, reject });
      this.worker.postMessage({ ...data, id });
    });
  }
  async prepare(
    commands: readonly WhiteboardModelCommand[],
    allowed = () => true,
    signal?: AbortSignal
  ) {
    await this.ready;
    if (signal?.aborted || !allowed()) throw new Error("后台编辑已取消");
    const prepareStart = performance.now(),
      intent = structuredClone(commands);
    if (this.proofHandoff) this.model.prepareLocalTranslations();
    const handoff = this.proofHandoff ? this.model.capturePreparedUpdate(intent) : undefined;
    const revision = this.revision,
      roots = this.model.doc.share.size,
      start = performance.now();
    const mainPreparationMs = start - prepareStart;
    const candidate = await this.request({
      type: "prepare",
      commands: intent,
      roots: this.roots(),
      incremental: this.incremental,
    });
    if (signal?.aborted || this.closed || !allowed()) throw new Error("后台编辑已取消");
    const receipt = {
      candidate,
      revision,
      roots,
      allowed,
      handoff,
      commands: intent,
      mainPreparationMs,
      roundTripMs: performance.now() - start,
    };
    this.receipts.add(receipt);
    return receipt;
  }
  cancel(receipt: Receipt) {
    this.receipts.delete(receipt);
  }
  commit(receipt: Receipt, origin: object) {
    if (!this.receipts.delete(receipt)) throw new Error("候选已取消或已经结算");
    if (
      this.closed ||
      !receipt.allowed() ||
      this.model.doc.store.pendingStructs ||
      this.model.doc.store.pendingDs ||
      this.model.doc._transaction ||
      this.model.doc._transactionCleanups.length
    )
      throw new Error("后台候选基线已失效");
    if (receipt.handoff) {
      this.committing = receipt.commands;
      try {
        return receipt.handoff(() => applyCandidate(this.model, receipt.candidate, origin), origin);
      } finally {
        this.committing = undefined;
      }
    }
    this.model.doc.transact(transaction => {
      if (
        transaction.changed.size ||
        transaction.deleteSet.clients.size ||
        receipt.revision !== this.revision ||
        receipt.roots !== this.model.doc.share.size
      )
        throw new Error("后台候选基线已失效");
      applyCandidate(this.model, receipt.candidate, origin);
    }, origin);
    return { isolated: false, snapshot: false, capacity: false };
  }
  dispose(error = new Error("后台准备器已关闭")) {
    if (this.closed) return;
    this.closed = true;
    this.model.doc.off("afterTransaction", this.changed);
    this.model.doc.off("update", this.sync);
    this.model.doc.off("destroy", this.destroyed);
    this.worker.terminate();
    this.requests.forEach(request => request.reject(error));
    this.requests.clear();
  }
}
