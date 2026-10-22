import { portableDevelopmentArtifacts } from "./plugin-portable-development";
import { app, type BrowserWindow } from "electron";
import { createHash } from "node:crypto";
import type { DevelopmentPluginPackage } from "@tau/plugins/host";
import type {
  ContentExecutionEnvelope,
  ContentExecutionRequest,
} from "../../../shared/content-execution";
import { createWindow } from "../windows/create-window";
import { getContentPluginArtifacts } from "./plugin-content-artifacts";

/** 内容代码只在无 Node、无业务 preload 的浏览器进程中求值。 */
export class ContentExecutor {
  private window?: BrowserWindow;
  private ready?: Promise<void>;
  private tail: Promise<unknown> = Promise.resolve();
  private queued = 0;
  private queuedBytes = 0;
  private snapshot = "";
  private closed = false;
  private quitHookInstalled = false;

  execute<T>(
    request: ContentExecutionRequest,
    signal?: AbortSignal,
    artifacts = getContentPluginArtifacts()
  ): Promise<T> {
    if (this.closed) return Promise.reject(new Error("内容执行服务正在退出"));
    if (this.queued >= 128) return Promise.reject(new Error("内容转换队列已满"));
    const bytes = Buffer.byteLength(JSON.stringify(request));
    if (bytes > 16 * 1024 * 1024 || this.queuedBytes + bytes > 64 * 1024 * 1024)
      return Promise.reject(new Error("内容转换队列数据过大"));
    // 固定请求与版本，排队期间不能被调用方更改。
    const input = structuredClone(request);
    const packages = artifacts.map(artifact => ({
      ...artifact,
      manifest: structuredClone(artifact.manifest),
    }));
    this.queued++;
    this.queuedBytes += bytes;
    const operation = this.tail
      .then(() => this.run<T>(input, packages, signal))
      .finally(() => {
        this.queued--;
        this.queuedBytes -= bytes;
      });
    this.tail = operation.catch(() => undefined);
    return operation;
  }

  private async ensureReady() {
    if (this.ready) return this.ready;
    if (!this.quitHookInstalled) {
      this.quitHookInstalled = true;
      app.once("quit", () => this.dispose());
    }
    const window = createWindow({
      route: "",
      document: "content-runtime",
      chrome: "none",
      show: false,
      devTools: false,
      webPreferences: {
        preload: undefined,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
        partition: "tau-content-runtime",
      },
    });
    this.window = window;
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", event => event.preventDefault());
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false)
    );
    const session = window.webContents.session;
    const preventDownload = (event: Electron.Event) => event.preventDefault();
    session.on("will-download", preventDownload);
    window.once("closed", () => session.removeListener("will-download", preventDownload));
    window.webContents.once("render-process-gone", () => {
      if (this.window === window) this.reset();
    });
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("内容执行进程启动超时"));
        this.reset();
      }, 15_000);
      window.webContents.once("did-finish-load", () => {
        clearTimeout(timer);
        resolve();
      });
      window.webContents.once("did-fail-load", (_event, _code, description) => {
        clearTimeout(timer);
        reject(new Error(description));
        this.reset();
      });
      window.once("closed", () => {
        clearTimeout(timer);
        reject(new Error("内容执行进程已关闭"));
        if (this.window === window) {
          this.window = undefined;
          this.ready = undefined;
          this.snapshot = "";
        }
      });
    });
    return this.ready;
  }

  private async run<T>(
    request: ContentExecutionRequest,
    artifacts: DevelopmentPluginPackage[],
    signal?: AbortSignal
  ): Promise<T> {
    if (this.closed) throw new Error("内容执行服务正在退出");
    signal?.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const cancel = () => reject(new Error("内容转换已取消"));
      signal?.addEventListener("abort", cancel, { once: true });
      void this.ensureReady()
        .then(resolve, reject)
        .finally(() => signal?.removeEventListener("abort", cancel));
    });
    signal?.throwIfAborted();
    if (this.closed || !this.window) throw new Error("内容执行服务已关闭");
    const window = this.window!;
    const portableArtifacts = await portableDevelopmentArtifacts();
    const hash = createHash("sha256")
      .update(
        JSON.stringify([...artifacts, ...portableArtifacts].map(artifact => artifact.manifest))
      )
      .digest("hex");
    const envelope: ContentExecutionEnvelope = {
      hash,
      request,
      ...(this.snapshot !== hash ? { artifacts, portableArtifacts } : {}),
    };
    const serialized = JSON.stringify(envelope);
    if (Buffer.byteLength(serialized) > 64 * 1024 * 1024) throw new Error("内容转换输入过大");
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel: () => void = () => undefined;
    const interrupted = new Promise<never>((_resolve, reject) => {
      cancel = () => {
        reject(new Error("内容转换已取消"));
        this.reset();
      };
      signal?.addEventListener("abort", cancel, { once: true });
      timer = setTimeout(() => {
        reject(new Error("内容转换超时"));
        this.reset();
      }, 30_000);
    });
    try {
      const result = await Promise.race([
        window.webContents.executeJavaScript(
          `globalThis.tauContentExecute(JSON.parse(${JSON.stringify(serialized)}))`
        ),
        interrupted,
      ]);
      signal?.throwIfAborted();
      if (this.window !== window || window.isDestroyed()) throw new Error("内容执行进程已失效");
      this.snapshot = hash;
      return result as T;
    } catch (error) {
      this.reset();
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    }
  }

  private reset() {
    const window = this.window;
    this.window = undefined;
    this.ready = undefined;
    this.snapshot = "";
    if (window && !window.isDestroyed()) {
      window.webContents.forcefullyCrashRenderer();
      window.destroy();
    }
  }
  dispose() {
    this.closed = true;
    this.reset();
  }
}

export const contentExecutor = new ContentExecutor();
