/**
 * 主进程 ⇄ 发布生成 worker 的消息协议（publish-generator-client / publish-generator.worker）。
 *
 * 一个 worker 只跑一次生成：请求随 workerData 下发，结束即回收。
 * 数据读取走独立 MessagePort + SharedArrayBuffer 的同步 RPC：worker 发请求后 Atomics.wait，
 * 主进程查库回帖并 notify，worker 用 receiveMessageOnPort 同步取回——生成器保持同步读库的写法。
 */

import type { MessagePort } from "node:worker_threads";
import type { IPublishAppearanceSettings, IPublishFile } from "@/types/publish";
import type { ISiteMeta, PublishDataSource, PublishSelectionInput } from "./publish-site-generator";
import type { PublishPluginSnapshot } from "../services/plugin-publish";

export interface PublishGeneratorRequest {
  template: import("../services/template-package").TemplatePackage;
  selections: PublishSelectionInput[];
  site: ISiteMeta;
  settings?: IPublishAppearanceSettings;
  plugins?: PublishPluginSnapshot;
  /** 计划预览只回传路径、摘要与依赖描述，不拷回文件字节。 */
  pathsOnly: boolean;
}

export interface PublishGeneratorWorkerData {
  request: PublishGeneratorRequest;
  dataPort: MessagePort;
  /** Int32Array over SharedArrayBuffer：0 = 等待回帖，1 = 回帖已入队 */
  signal: Int32Array;
}

export type DataMethod = keyof PublishDataSource;

export interface DataCall {
  method: DataMethod;
  args: unknown[];
}

export type DataReply = { ok: true; value: unknown } | { ok: false; message: string };

/** worker → 主进程 */
export type WorkerToMain =
  | {
      type: "content-search";
      reqId: number;
      input: import("./publish-search-index").BuildPublishSearchIndexInput;
    }
  | { type: "tailwind"; reqId: number; code: string; extension: "tsx" | "html" }
  | { type: "done"; files: IPublishFile[]; virtualProcessed: number }
  | {
      type: "done-paths";
      paths: string[];
      files: import("@/types/publish").PublishFileDescriptor[];
      release: import("@/types/publish").PublishedRelease;
      virtualProcessed: number;
    }
  | { type: "error"; message: string };

/** 主进程 → worker */
export type MainToWorker =
  | {
      type: "content-search-result";
      reqId: number;
      result?: import("@tau/plugins/publish-data").SearchFile;
      error?: string;
    }
  | { type: "tailwind-result"; reqId: number; css: string; error?: string };
