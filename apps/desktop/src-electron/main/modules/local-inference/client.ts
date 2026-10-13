import { app, utilityProcess, type UtilityProcess } from "electron";
import { join } from "node:path";
import type {
  InferenceInput,
  InferencePriority,
  InferenceReply,
  InferenceRequest,
  InferenceResult,
} from "./protocol";

interface PendingInference {
  request: InferenceRequest;
  priority: InferencePriority;
  resolve(result: InferenceResult): void;
  reject(error: Error): void;
}

/** 只向子进程派发一条任务，使查询可以越过尚未执行的重建任务。 */
export class InferenceClient {
  private child: UtilityProcess | null = null;
  private ready = false;
  private disposed = false;
  private nextId = 0;
  private queue: PendingInference[] = [];
  private active: PendingInference | null = null;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private scheduled: ReturnType<typeof setTimeout> | undefined;
  private quitHookInstalled = false;

  request(input: InferenceInput, priority: InferencePriority): Promise<InferenceResult> {
    if (this.disposed) return Promise.reject(new Error("本地推理服务已关闭"));
    return new Promise((resolve, reject) => {
      this.queue.push({ request: { ...input, id: ++this.nextId }, priority, resolve, reject });
      try {
        this.ensureStarted();
        this.schedule();
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private ensureStarted() {
    if (this.child) return;
    if (!this.quitHookInstalled) {
      // 自动同步等退出收尾仍可使用推理，真正退出时才释放子进程。
      app.once("quit", () => this.dispose());
      this.quitHookInstalled = true;
    }
    const child = utilityProcess.fork(join(__dirname, "local-inference-worker.js"), [], {
      serviceName: "Tau Local Embedding",
      stdio: "ignore",
    });
    this.child = child;
    this.timeout = setTimeout(() => this.fail(new Error("本地推理进程启动超时")), 30_000);
    child.on("error", type => {
      if (this.child === child) this.fail(new Error(`本地推理进程异常（${type}）`));
    });
    child.on("exit", code => {
      if (this.child === child) this.fail(new Error(`本地推理进程退出（${code}）`));
    });
    child.on("message", (reply: InferenceReply) => {
      if (this.child !== child) return;
      if (reply.kind === "ready") {
        clearTimeout(this.timeout);
        this.ready = true;
        this.schedule();
        return;
      }
      const pending = this.active;
      if (!pending || pending.request.id !== reply.id) return;
      clearTimeout(this.timeout);
      this.active = null;
      if (reply.kind === "result") pending.resolve(reply.result);
      else pending.reject(new Error(reply.message));
      this.schedule();
    });
  }

  private schedule() {
    if (!this.ready || this.active || !this.queue.length) return;
    clearTimeout(this.scheduled);
    const interactive = this.queue.some(item => item.priority === "interactive");
    // 后台文本之间短暂让出资源；交互查询不承担这段等待。
    this.scheduled = setTimeout(() => this.dispatch(), interactive ? 0 : 10);
  }

  private dispatch() {
    this.scheduled = undefined;
    if (!this.ready || this.active || !this.child || !this.queue.length) return;
    const interactiveIndex = this.queue.findIndex(item => item.priority === "interactive");
    const [pending] = this.queue.splice(interactiveIndex < 0 ? 0 : interactiveIndex, 1);
    this.active = pending;
    this.timeout = setTimeout(() => this.fail(new Error("本地向量推理超时")), 180_000);
    try {
      this.child.postMessage(pending.request);
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private fail(error: Error) {
    clearTimeout(this.timeout);
    clearTimeout(this.scheduled);
    const child = this.child;
    this.child = null;
    this.ready = false;
    this.active?.reject(error);
    this.active = null;
    for (const pending of this.queue.splice(0)) pending.reject(error);
    child?.kill();
  }

  dispose() {
    this.disposed = true;
    this.fail(new Error("本地推理服务已关闭"));
  }
}
