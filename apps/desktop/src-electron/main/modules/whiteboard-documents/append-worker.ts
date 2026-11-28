import { join } from "node:path";
import { Worker } from "node:worker_threads";
import type { AppendInput, PreparedAppend } from "./prepare-append";

export type AppendWorkerResult =
  | { ok: true; value: PreparedAppend }
  | { ok: false; message: string };

/** 会话复用校验线程，每次仍从本次确认状态生成独立候选。 */
export class WhiteboardAppendWorker {
  private readonly worker: Worker;
  private pending?: { resolve(value: PreparedAppend): void; reject(error: Error): void };
  private closed = false;

  constructor(workerPath = join(__dirname, "whiteboard-append-worker.js")) {
    this.worker = new Worker(workerPath);
    this.worker.on("message", (result: AppendWorkerResult) => {
      const pending = this.pending;
      this.pending = undefined;
      this.worker.unref();
      if (result.ok) pending?.resolve(result.value);
      else pending?.reject(new Error(result.message));
    });
    this.worker.once("error", error => this.fail(error));
    this.worker.once("exit", code => this.fail(new Error(`白板校验线程已退出（${code}）`)));
    this.worker.unref();
  }

  get isClosed() {
    return this.closed;
  }

  prepare(input: AppendInput): Promise<PreparedAppend> {
    if (this.closed) return Promise.reject(new Error("白板校验线程已关闭"));
    if (this.pending) return Promise.reject(new Error("白板校验必须串行执行"));
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.worker.ref();
      try {
        this.worker.postMessage(input);
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private fail(error: Error) {
    this.closed = true;
    const pending = this.pending;
    this.pending = undefined;
    pending?.reject(error);
    this.worker.unref();
  }

  dispose() {
    this.fail(new Error("白板会话已关闭"));
    return this.worker.terminate().then(
      () => undefined,
      error => {
        console.warn("[whiteboard-sync] 校验线程释放失败", error);
      }
    );
  }
}
