import { ipcMain } from "electron";
import { Module } from "../types/module";
import { ChildProcess, fork } from "node:child_process";
import path from "node:path";
// 运行时类名与应用同一套语义词表；worker 是独立进程，读不到 workspace 包，由这里随任务传入
import TAU_TAILWIND_THEME_CSS from "@tau/themes/tailwind.css?raw";

type WorkerResponse =
  { ok: true; id: number; css: string } | { ok: false; id: number; error?: string };

class TailwindRuntimeModule implements Module {
  name: string;
  private worker?: ChildProcess;
  private requestId = 0;
  private pending = new Map<
    number,
    { resolve: (css: string) => void; reject: (error: Error) => void }
  >();

  constructor() {
    this.name = "tailwind-runtime";
  }

  async init() {
    this.ensureWorker();

    ipcMain.handle(
      "tailwind-runtime:compile",
      async (_event, payload: { content: string; extension?: string }) => {
        return this.compileTailwindCss(
          typeof payload?.content === "string" ? payload.content : "",
          typeof payload?.extension === "string" ? payload.extension : undefined
        );
      }
    );
  }

  private ensureWorker() {
    if (this.worker && !this.worker.killed) {
      return;
    }

    const workerPath = path.join(__dirname, "workers", "tailwind-runtime-worker.js");

    this.worker = fork(workerPath, {
      stdio: ["pipe", "pipe", "pipe", "ipc"],
      execPath: process.execPath,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    });
    const prefix = "[tailwind-runtime]";

    this.worker.stdout?.setEncoding("utf8");
    this.worker.stdout?.on("data", chunk => {
      const text = chunk.toString();
      if (text.trim().length > 0) {
        console.log(`${prefix} ${text}`);
      }
    });

    let stderrBuffer = "";
    this.worker.stderr?.setEncoding("utf8");
    this.worker.stderr?.on("data", chunk => {
      const text = chunk.toString();
      stderrBuffer += text;
      if (text.trim().length > 0) {
        console.error(`${prefix} ${text}`);
      }
    });

    this.worker.on("message", (message: WorkerResponse) => {
      const handler = this.pending.get(message.id);
      if (!handler) {
        return;
      }
      this.pending.delete(message.id);
      if (message.ok) {
        handler.resolve(message.css);
      } else {
        handler.reject(new Error(message.error ?? "Tailwind compiler worker returned an error"));
      }
    });

    this.worker.on("error", error => {
      console.error(`${prefix} worker error`, error);
      this.rejectAll(error);
      this.disposeWorker();
    });

    this.worker.on("close", code => {
      const detail =
        stderrBuffer.trim().length > 0
          ? `${stderrBuffer.trim()}`
          : "Tailwind compiler worker exited unexpectedly";
      const error = new Error(
        `Tailwind compiler worker exited with code ${code}${detail ? `: ${detail}` : ""}`
      );
      console.error(`${prefix} ${error.message}`);
      this.rejectAll(error);
      this.disposeWorker();
    });
  }

  private disposeWorker() {
    if (this.worker && !this.worker.killed) {
      this.worker.kill("SIGTERM");
    }
    this.worker = undefined;
  }

  private rejectAll(error: Error) {
    for (const [, handler] of this.pending) {
      handler.reject(error);
    }
    this.pending.clear();
  }

  async compileTailwindCss(content: string, extension?: string): Promise<string> {
    const trimmed = content?.trim();
    if (!trimmed) {
      return "";
    }
    return this.compileInternal(trimmed, extension);
  }

  private async compileInternal(content: string, extension?: string): Promise<string> {
    this.ensureWorker();
    if (!this.worker) {
      throw new Error("Tailwind compiler worker is unavailable");
    }
    const id = ++this.requestId;
    return new Promise<string>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker?.send({ id, content, extension, themeCss: TAU_TAILWIND_THEME_CSS });
    });
  }
}

export default new TailwindRuntimeModule();
