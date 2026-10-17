import { Worker } from "node:worker_threads";
import { join } from "node:path";
import { getHeadlessPluginArtifacts } from "../services/plugin-codecs";
import type {
  IndexContentInput,
  IndexContentReply,
  IndexContentResult,
} from "./index-content-protocol";

/** 每轮扫描懒建一个工作线程，逐篇转换，结束或异常时由调用方回收。 */
export class IndexContentClient {
  private worker: Worker | null = null;
  private pending: { resolve(value: IndexContentResult): void; reject(error: Error): void } | null =
    null;
  private failure: Error | null = null;

  prepare(input: IndexContentInput): Promise<IndexContentResult> {
    if (this.failure) return Promise.reject(this.failure);
    if (this.pending) return Promise.reject(new Error("正文转换必须串行执行"));
    if (!this.worker) {
      this.worker = new Worker(join(__dirname, "index-content-worker.js"), {
        workerData: { editorPlugins: getHeadlessPluginArtifacts() },
      });
      this.worker.on("message", (reply: IndexContentReply) => {
        const pending = this.pending;
        this.pending = null;
        if (reply.ok) pending?.resolve(reply.result);
        else pending?.reject(new Error(reply.message));
      });
      this.worker.on("error", error => this.fail(error));
      this.worker.on("exit", code => this.fail(new Error(`正文转换线程退出（${code}）`)));
    }
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      try {
        this.worker!.postMessage(input);
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private fail(error: Error) {
    this.failure = error;
    this.pending?.reject(error);
    this.pending = null;
  }

  async dispose() {
    this.fail(new Error("正文转换已结束"));
    const worker = this.worker;
    this.worker = null;
    await worker?.terminate();
  }
}
