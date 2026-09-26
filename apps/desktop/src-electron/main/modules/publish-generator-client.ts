/**
 * 在 worker 线程里生成发布文件，避免整站生成（模板注入 / 序列化 / 哈希 / 搜索索引）阻塞主进程。
 * 每次生成起一个 worker，结束即回收；worker 的查库请求与 Tailwind 编译在主进程应答。
 */

import { MessageChannel, Worker } from "node:worker_threads";
import { join } from "node:path";
import log from "electron-log";
import type { IPublishFile } from "@/types/publish";
import type { PublishDataSource } from "./publish-site-generator";
import TailwindRuntimeModule from "./tailwind-runtime";
import type {
  DataCall,
  DataReply,
  MainToWorker,
  PublishGeneratorRequest,
  PublishGeneratorWorkerData,
  WorkerToMain,
} from "./publish-generator-protocol";

const WORKER_PATH = join(__dirname, "publish-generator-worker.js");

const tailwindCssCache = new Map<string, string>();

async function compileTailwind(code: string, extension: "tsx" | "html"): Promise<string> {
  const key = `${extension}::${code}`;
  const cached = tailwindCssCache.get(key);
  if (cached) return cached;
  const css = await TailwindRuntimeModule.compileTailwindCss(code, extension);
  if (css) tailwindCssCache.set(key, css);
  return css;
}

function runWorker(
  data: PublishDataSource,
  request: PublishGeneratorRequest
): Promise<Extract<WorkerToMain, { type: "done" | "done-paths" }>> {
  return new Promise((resolve, reject) => {
    const { port1, port2 } = new MessageChannel();
    const signal = new Int32Array(new SharedArrayBuffer(4));
    const workerData: PublishGeneratorWorkerData = { request, dataPort: port2, signal };
    const worker = new Worker(WORKER_PATH, { workerData, transferList: [port2] });
    let settled = false;

    const finish = (
      error: Error | null,
      result?: Extract<WorkerToMain, { type: "done" | "done-paths" }>
    ) => {
      if (settled) return;
      settled = true;
      port1.close();
      void worker.terminate();
      if (error) reject(error);
      else resolve(result!);
    };

    port1.on("message", ({ method, args }: DataCall) => {
      let reply: DataReply;
      try {
        const fn = data[method] as (...params: unknown[]) => unknown;
        reply = { ok: true, value: fn.apply(data, args) };
      } catch (error) {
        reply = { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
      port1.postMessage(reply);
      Atomics.store(signal, 0, 1);
      Atomics.notify(signal, 0);
    });

    worker.on("message", (message: WorkerToMain) => {
      if (message.type === "tailwind") {
        compileTailwind(message.code, message.extension).then(
          css =>
            worker.postMessage({
              type: "tailwind-result",
              reqId: message.reqId,
              css,
            } satisfies MainToWorker),
          error => {
            log.error("Tailwind runtime compile failed:", error);
            worker.postMessage({
              type: "tailwind-result",
              reqId: message.reqId,
              css: "",
              error: String(error),
            } satisfies MainToWorker);
          }
        );
      } else if (message.type === "error") {
        finish(new Error(message.message));
      } else {
        finish(null, message);
      }
    });
    worker.on("error", error => finish(error));
    worker.on("exit", code => finish(new Error(`发布生成 worker 意外退出（code ${code}）`)));
  });
}

/** 结构化克隆会把 Buffer 变成 Uint8Array，上传侧依赖 Buffer 语义，这里还原 */
const toBuffer = (content: IPublishFile["content"] | Uint8Array): IPublishFile["content"] =>
  typeof content === "string" || Buffer.isBuffer(content)
    ? content
    : Buffer.from(content.buffer, content.byteOffset, content.byteLength);

export async function generatePublishFilesInWorker(
  data: PublishDataSource,
  request: Omit<PublishGeneratorRequest, "pathsOnly">
): Promise<{ files: IPublishFile[]; virtualProcessed: number }> {
  const result = await runWorker(data, { ...request, pathsOnly: false });
  if (result.type !== "done") throw new Error("发布生成 worker 返回了非预期结果");
  return {
    files: result.files.map(file => ({ ...file, content: toBuffer(file.content) })),
    virtualProcessed: result.virtualProcessed,
  };
}

export async function generatePublishPathsInWorker(
  data: PublishDataSource,
  request: Omit<PublishGeneratorRequest, "pathsOnly">
): Promise<{ paths: string[]; virtualProcessed: number }> {
  const result = await runWorker(data, { ...request, pathsOnly: true });
  if (result.type !== "done-paths") throw new Error("发布生成 worker 返回了非预期结果");
  return { paths: result.paths, virtualProcessed: result.virtualProcessed };
}
