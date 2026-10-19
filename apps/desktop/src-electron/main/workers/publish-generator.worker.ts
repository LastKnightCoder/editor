/**
 * 发布站点生成 worker：在独立线程跑 PublishSiteGenerator，主进程只负责查库与 Tailwind 编译。
 * 协议见 modules/publish-generator-protocol。
 */

import { parentPort, receiveMessageOnPort, workerData } from "node:worker_threads";
import { desktopContentPlugins } from "../../../shared/content-plugins.ts";
import { sharedPluginModules } from "@tau/plugins/shared-modules";
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
const tailwindPending = new Map<
  number,
  { resolve: (css: string) => void; reject: (e: Error) => void }
>();
port.on("message", (message: MainToWorker) => {
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
  desktopContentPlugins.load(
    request.plugins?.plugins.map(plugin => plugin.artifact) ?? [],
    sharedPluginModules
  );
  const generator = new PublishSiteGenerator({
    template: request.template,
    clientSource: request.clientSource,
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

run().catch(error => {
  post({ type: "error", message: error instanceof Error ? error.message : String(error) });
});
