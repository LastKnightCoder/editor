/**
 * 本地推理服务（node-llama-cpp）
 *
 * 替代原 Python Server 的本地推理职责：
 * - embed_texts：BGE-M3 GGUF 向量化
 *
 * 语义与 Python 侧保持一致：模型懒加载、路径/设备变化时重建。
 */

import { app } from "electron";
import path from "node:path";
import fs from "node:fs";
import log from "electron-log";
import type { Llama, LlamaModel, LlamaEmbeddingContext } from "node-llama-cpp";
import { getEmbeddingModelEntry, GgufModelEntry } from "./model-registry";

export type DevicePolicy = "auto" | "cpu" | "cuda";

export interface EmbedTextsOptions {
  modelDir?: string;
  modelName: string;
  batchSize?: number;
  devicePolicy?: DevicePolicy;
}

export interface EmbedTextsResult {
  embeddings: number[][];
  dimensions: number;
  device: string;
}

export interface EmbeddingHealth {
  loaded: boolean;
  model_path?: string;
  model_name?: string;
  device?: string;
  dimensions?: number;
}

const getDefaultModelsDir = () => {
  return path.join(app.getPath("userData"), "embedding-models");
};

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
      // node-llama-cpp 为 ESM-only，主进程 CJS 产物必须动态 import
      this.llamaModule = await import("node-llama-cpp");
    }
    if (!this.llama) {
      this.llama = await this.llamaModule.getLlama();
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
    log.info("[LocalInference] Loading model:", modelPath, "device:", device);
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

class EmbeddingRuntime extends LlamaRuntimeBase {
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
        this.context = await model.createEmbeddingContext();
      }

      const embeddings: number[][] = [];
      for (const text of texts) {
        const embedding = await this.context.getEmbeddingFor(text);
        embeddings.push(Array.from(embedding.vector));
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
    this.context?.dispose();
    this.context = null;
    await super.unload();
  }

  /** 仅确保模型已加载（预热，同时建立 embedding context） */
  async warmup(modelPath: string, devicePolicy: DevicePolicy): Promise<void> {
    await this.queue.run(async () => {
      const { model } = await this.ensureLoaded(modelPath, devicePolicy);
      if (!this.context) {
        this.context = await model.createEmbeddingContext();
      }
    });
  }
}

class LocalInferenceService {
  readonly embedding = new EmbeddingRuntime();

  private resolveModelPath(modelDir: string | undefined, entry: GgufModelEntry): string {
    const dir = modelDir || getDefaultModelsDir();
    return path.join(dir, entry.name, entry.file);
  }

  /**
   * 检查本地 embedding 模型文件是否已下载（供索引队列前置检查，
   * 避免模型缺失时逐条任务报错）
   */
  isEmbeddingModelReady(options: { modelDir?: string; modelName: string }): boolean {
    const entry = getEmbeddingModelEntry(options.modelName);
    if (!entry) {
      return false;
    }
    return fs.existsSync(this.resolveModelPath(options.modelDir, entry));
  }

  async embedTexts(texts: string[], options: EmbedTextsOptions): Promise<EmbedTextsResult> {
    const entry = getEmbeddingModelEntry(options.modelName);
    if (!entry) {
      throw new Error(`未知的本地 embedding 模型: ${options.modelName}`);
    }
    const modelPath = this.resolveModelPath(options.modelDir, entry);
    if (!fs.existsSync(modelPath)) {
      throw new Error(
        `Embedding 模型不存在: ${modelPath}，请在「设置 → 向量模型」中下载后自动继续索引`
      );
    }
    return this.embedding.embed(texts, modelPath, options.devicePolicy || "auto");
  }

  async embeddingHealth(options: {
    modelDir?: string;
    modelName: string;
    devicePolicy?: DevicePolicy;
  }): Promise<{ success: boolean; health: EmbeddingHealth; error?: string }> {
    const entry = getEmbeddingModelEntry(options.modelName);
    if (!entry) {
      return {
        success: false,
        health: this.embedding.health(),
        error: `未知模型: ${options.modelName}`,
      };
    }

    const modelPath = this.resolveModelPath(options.modelDir, entry);
    if (fs.existsSync(modelPath)) {
      try {
        await this.embedding.warmup(modelPath, options.devicePolicy || "auto");
      } catch (error) {
        return {
          success: false,
          health: this.embedding.health(),
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    return { success: true, health: this.embedding.health() };
  }
}

const localInference = new LocalInferenceService();
export default localInference;
