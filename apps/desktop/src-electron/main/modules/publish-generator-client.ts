/**
 * 在 worker 线程里生成发布文件，避免数据序列化、哈希与搜索索引阻塞主进程。
 * 每次生成起一个 worker，结束即回收；worker 的查库请求与 Tailwind 编译在主进程应答。
 */

import { MessageChannel, Worker } from "node:worker_threads";
import { join } from "node:path";
import log from "electron-log";
import type { IPublishFile, PublishImageWarning } from "@/types/publish";
import type { PublishDataSource } from "./publish-site-generator";
import TailwindRuntimeModule from "./tailwind-runtime";
import { contentExecutor } from "../services/content-execution";
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
    const contentController = new AbortController();

    const finish = (
      error: Error | null,
      result?: Extract<WorkerToMain, { type: "done" | "done-paths" }>
    ) => {
      if (settled) return;
      settled = true;
      contentController.abort();
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
      if (message.type === "content-search") {
        void contentExecutor
          .execute<import("@tau/plugins/publish-data").SearchFile>(
            { operation: "publish-search", input: message.input },
            contentController.signal,
            request.plugins?.plugins.map(plugin => plugin.artifact) ?? []
          )
          .then(result => {
            if (!settled)
              worker.postMessage({
                type: "content-search-result",
                reqId: message.reqId,
                result,
              } satisfies MainToWorker);
          })
          .catch(error => {
            if (!settled)
              worker.postMessage({
                type: "content-search-result",
                reqId: message.reqId,
                error: String(error),
              } satisfies MainToWorker);
          });
        return;
      }
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
        // worker 的调用栈不随 message 跨线程，单独回传并记日志，否则只剩主进程侧的转发栈
        log.error("Publish generator worker failed:", message.stack ?? message.message);
        const error = new Error(message.message);
        if (message.stack) error.stack = message.stack;
        finish(error);
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
): Promise<{
  files: IPublishFile[];
  virtualProcessed: number;
  imageWarnings: PublishImageWarning[];
}> {
  const result = await runWorker(data, { ...request, pathsOnly: false });
  if (result.type !== "done") throw new Error("发布生成 worker 返回了非预期结果");
  return {
    files: result.files.map(file => ({ ...file, content: toBuffer(file.content) })),
    virtualProcessed: result.virtualProcessed,
    imageWarnings: result.imageWarnings,
  };
}

export async function generatePublishPathsInWorker(
  data: PublishDataSource,
  request: Omit<PublishGeneratorRequest, "pathsOnly">
): Promise<Extract<WorkerToMain, { type: "done-paths" }>> {
  const result = await runWorker(data, { ...request, pathsOnly: true });
  if (result.type !== "done-paths") throw new Error("发布生成 worker 返回了非预期结果");
  return result;
}
