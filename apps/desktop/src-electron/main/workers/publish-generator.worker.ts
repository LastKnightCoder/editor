/**
 * 发布站点生成 worker：在独立线程跑 PublishSiteGenerator，主进程只负责查库与 Tailwind 编译。
 * 协议见 modules/publish-generator-protocol。
 */

import { parentPort, receiveMessageOnPort, workerData } from "node:worker_threads";
import { PublishSiteGenerator, type PublishDataSource } from "../modules/publish-site-generator";
import { describeRelease } from "../modules/publish-release-state";
import type {
  DataCall,
  DataMethod,
  DataReply,
  MainToWorker,
  PublishGeneratorWorkerData,
  WorkerToMain,
} from "../modules/publish-generator-protocol";

const { request, dataPort, signal } = workerData as PublishGeneratorWorkerData;
const port = parentPort!;
const post = (message: WorkerToMain) => port.postMessage(message);

function callMain(method: DataMethod, args: unknown[]): unknown {
  Atomics.store(signal, 0, 0);
  dataPort.postMessage({ method, args } satisfies DataCall);
  Atomics.wait(signal, 0, 0);
  const reply = receiveMessageOnPort(dataPort)?.message as DataReply | undefined;
  if (!reply) throw new Error(`发布数据读取无响应：${method}`);
  if (!reply.ok) throw new Error(reply.message);
  return reply.value;
}

const dataSource = new Proxy({} as PublishDataSource, {
  get:
    (_target, method) =>
    (...args: unknown[]) =>
      callMain(method as DataMethod, args),
});

let tailwindSeq = 0;
const searchPending = new Map<
  number,
  {
    resolve(value: import("@tau/plugins/publish-data").SearchFile): void;
    reject(error: Error): void;
  }
>();
const tailwindPending = new Map<
  number,
  { resolve: (css: string) => void; reject: (e: Error) => void }
>();
port.on("message", (message: MainToWorker) => {
  if (message.type === "content-search-result") {
    const pending = searchPending.get(message.reqId);
    if (!pending) return;
    searchPending.delete(message.reqId);
    if (message.error || !message.result)
      pending.reject(new Error(message.error || "发布内容转换结果缺失"));
    else pending.resolve(message.result);
    return;
  }
  if (message.type !== "tailwind-result") return;
  const pending = tailwindPending.get(message.reqId);
  if (!pending) return;
  tailwindPending.delete(message.reqId);
  if (message.error) pending.reject(new Error(message.error));
  else pending.resolve(message.css);
});

const compileTailwind = (code: string, extension: "tsx" | "html") =>
  new Promise<string>((resolve, reject) => {
    const reqId = ++tailwindSeq;
    tailwindPending.set(reqId, { resolve, reject });
    post({ type: "tailwind", reqId, code, extension });
  });

async function run() {
  const generator = new PublishSiteGenerator({
    buildSearchIndex: buildSearchIndex,
    template: request.template,
    compileTailwind,
    logger: console,
    plugins: request.plugins,
  });
  const { files, virtualProcessed } = await generator.generate(
    dataSource,
    request.selections,
    request.site,
    request.settings
  );
  if (request.pathsOnly) {
    post({
      type: "done-paths",
      paths: files.map(file => file.path),
      files: files.map(({ content: _content, ...file }) => file),
      release: describeRelease(files),
      virtualProcessed,
    });
  } else {
    post({ type: "done", files, virtualProcessed });
  }
}

/** 搜索文档互相独立，分批传输并在末尾按原规则排序，避免一次克隆全站正文。 */
async function buildSearchIndex(
  input: import("../modules/publish-search-index").BuildPublishSearchIndexInput
): Promise<import("@tau/plugins/publish-data").SearchFile> {
  const documents: import("@tau/plugins/publish-data").SearchDocument[] = [];
  let batch: typeof input = { cards: [], articles: [], docs: [], quests: [] };
  let size = 0,
    count = 0;
  const flush = async () => {
    if (!count) return;
    const current = batch;
    batch = { cards: [], articles: [], docs: [], quests: [] };
    size = 0;
    count = 0;
    const result = await new Promise<import("@tau/plugins/publish-data").SearchFile>(
      (resolve, reject) => {
        const reqId = ++tailwindSeq;
        searchPending.set(reqId, { resolve, reject });
        post({ type: "content-search", reqId, input: current });
      }
    );
    if (result.version !== 1 || !Array.isArray(result.documents))
      throw new Error("发布搜索数据协议无效");
    documents.push(...result.documents);
  };
  for (const key of ["cards", "articles", "docs", "quests"] as const) {
    for (const item of input[key]) {
      const bytes = Buffer.byteLength(JSON.stringify(item));
      if (count && (size + bytes > 4 * 1024 * 1024 || count >= 32)) await flush();
      (batch[key] as unknown[]).push(item);
      size += bytes;
      count++;
    }
  }
  await flush();
  return {
    version: 1,
    documents: documents.sort((left, right) => left.key.localeCompare(right.key)),
  };
}

run().catch(error => {
  post({ type: "error", message: error instanceof Error ? error.message : String(error) });
});
