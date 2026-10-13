/**
 * 本地推理服务（node-llama-cpp）
 *
 * 替代原 Python Server 的本地推理职责：
 * - embed_texts：BGE-M3 GGUF 向量化
 *
 * 语义与 Python 侧保持一致：模型懒加载、路径/设备变化时重建。
 */

import path from "node:path";
import { availableParallelism } from "node:os";
import type { Llama, LlamaModel, LlamaEmbeddingContext } from "node-llama-cpp";
import { averageNormalized, toEmbeddingWindows } from "./embedding-input";
import type { DevicePolicy, EmbedTextsResult, EmbeddingHealth } from "./protocol";

// 为界面、数据库和其它后台任务保留 CPU 余量。
const inferenceThreads = Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2)));
const contextOptions = { threads: inferenceThreads, contextSize: 512, batchSize: 512 };

/** 串行化推理调用，避免并发使用同一 context */
class PromiseQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

interface LoadedModel {
  model: LlamaModel;
  modelPath: string;
  device: string;
}

abstract class LlamaRuntimeBase {
  protected llama: Llama | null = null;
  protected llamaModule: typeof import("node-llama-cpp") | null = null;
  protected loaded: LoadedModel | null = null;
  protected queue = new PromiseQueue();

  protected async getLlamaInstance(): Promise<Llama> {
    if (!this.llamaModule) {
      // node-llama-cpp 为 ESM-only，CJS 子进程产物必须动态 import。
      this.llamaModule = await import("node-llama-cpp");
    }
    if (!this.llama) {
      this.llama = await this.llamaModule.getLlama({ maxThreads: inferenceThreads });
    }
    return this.llama;
  }

  protected resolveDeviceString(): string {
    return this.llama?.gpu ? "gpu" : "cpu";
  }

  protected async ensureLoaded(
    modelPath: string,
    devicePolicy: DevicePolicy
  ): Promise<LoadedModel> {
    const llama = await this.getLlamaInstance();
    const device = devicePolicy === "cpu" ? "cpu" : this.resolveDeviceString();

    if (this.loaded && this.loaded.modelPath === modelPath && this.loaded.device === device) {
      return this.loaded;
    }

    await this.unload();
    const model = await llama.loadModel({
      modelPath,
      // cpu 策略下不加载 GPU 层，其余交给 llama.cpp 自动选择
      gpuLayers: devicePolicy === "cpu" ? 0 : undefined,
    });
    this.loaded = { model, modelPath, device };
    return this.loaded;
  }

  async unload(): Promise<void> {
    if (this.loaded) {
      await this.loaded.model.dispose().catch(() => undefined);
      this.loaded = null;
    }
  }
}

export class EmbeddingRuntime extends LlamaRuntimeBase {
  private context: LlamaEmbeddingContext | null = null;
  private dimensions = 0;

  async embed(
    texts: string[],
    modelPath: string,
    devicePolicy: DevicePolicy
  ): Promise<EmbedTextsResult> {
    if (!texts.length) {
      return {
        embeddings: [],
        dimensions: this.dimensions,
        device: this.loaded?.device || "cpu",
      };
    }

    return this.queue.run(async () => {
      const { model } = await this.ensureLoaded(modelPath, devicePolicy);

      if (!this.context) {
        this.context = await model.createEmbeddingContext(contextOptions);
      }

      const context = this.context;
      // 手动补 <s> 并按窗口嵌入，原因见 embedding-input.ts
      const bos = model.tokens.shouldPrependBosToken ? model.tokens.bos : null;
      const embeddings: number[][] = [];
      for (const text of texts) {
        const windows = toEmbeddingWindows(model.tokenize(text), bos);
        if (windows.length === 0) {
          embeddings.push(Array.from((await context.getEmbeddingFor(text)).vector));
          continue;
        }
        const vectors: number[][] = [];
        for (const window of windows) {
          vectors.push(Array.from((await context.getEmbeddingFor(window)).vector));
        }
        embeddings.push(averageNormalized(vectors));
      }

      if (!this.dimensions && embeddings.length) {
        this.dimensions = embeddings[0].length;
      }
      return {
        embeddings,
        dimensions: this.dimensions,
        device: this.loaded?.device || "cpu",
      };
    });
  }

  health(): EmbeddingHealth {
    return {
      loaded: !!this.loaded,
      model_path: this.loaded?.modelPath,
      model_name: this.loaded ? this.loaded.modelPath.split(path.sep).slice(-2)[0] : undefined,
      device: this.loaded?.device || "cpu",
      dimensions: this.dimensions,
    };
  }

  async unload(): Promise<void> {
    await this.context?.dispose();
    this.context = null;
    this.dimensions = 0;
    await super.unload();
  }

  /** 仅确保模型已加载（预热，同时建立 embedding context） */
  async warmup(modelPath: string, devicePolicy: DevicePolicy): Promise<void> {
    await this.queue.run(async () => {
      const { model } = await this.ensureLoaded(modelPath, devicePolicy);
      if (!this.context) {
        this.context = await model.createEmbeddingContext(contextOptions);
      }
    });
  }
}
