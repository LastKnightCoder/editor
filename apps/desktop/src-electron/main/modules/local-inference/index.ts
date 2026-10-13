import { app } from "electron";
import path from "node:path";
import fs from "node:fs";
import { getEmbeddingModelEntry } from "./model-registry";
import { InferenceClient } from "./client";
import type { EmbedTextsOptions, EmbedTextsResult, EmbeddingHealth } from "./protocol";

export type {
  DevicePolicy,
  EmbedTextsOptions,
  EmbedTextsResult,
  EmbeddingHealth,
} from "./protocol";

class LocalInferenceService {
  private client = new InferenceClient();

  private resolveModelPath(options: EmbedTextsOptions): string {
    const entry = getEmbeddingModelEntry(options.modelName);
    if (!entry) throw new Error(`未知的本地 embedding 模型: ${options.modelName}`);
    const dir = options.modelDir || path.join(app.getPath("userData"), "embedding-models");
    return path.join(dir, entry.name, entry.file);
  }

  isEmbeddingModelReady(options: EmbedTextsOptions): boolean {
    return (
      !!getEmbeddingModelEntry(options.modelName) && fs.existsSync(this.resolveModelPath(options))
    );
  }

  async embedTexts(texts: string[], options: EmbedTextsOptions): Promise<EmbedTextsResult> {
    const modelPath = this.resolveModelPath(options);
    if (!fs.existsSync(modelPath)) {
      throw new Error(
        `Embedding 模型不存在: ${modelPath}，请在「设置 → 向量模型」中下载后自动继续索引`
      );
    }
    const result: EmbedTextsResult = { embeddings: [], dimensions: 0, device: "cpu" };
    for (const text of texts) {
      const reply = await this.client.request(
        { kind: "embed", text, modelPath, devicePolicy: options.devicePolicy || "auto" },
        options.priority || "background"
      );
      if (reply.kind !== "embed") throw new Error("本地推理响应类型不匹配");
      result.embeddings.push(...reply.value.embeddings);
      result.dimensions = reply.value.dimensions;
      result.device = reply.value.device;
    }
    return result;
  }

  async embeddingHealth(options: EmbedTextsOptions): Promise<{
    success: boolean;
    health: EmbeddingHealth;
    error?: string;
  }> {
    const unloaded: EmbeddingHealth = { loaded: false, device: "cpu", dimensions: 0 };
    try {
      const modelPath = this.resolveModelPath(options);
      if (!fs.existsSync(modelPath)) return { success: true, health: unloaded };
      const reply = await this.client.request(
        { kind: "warmup", modelPath, devicePolicy: options.devicePolicy || "auto" },
        "interactive"
      );
      if (reply.kind !== "warmup") throw new Error("本地推理响应类型不匹配");
      return { success: true, health: reply.value };
    } catch (error) {
      return {
        success: false,
        health: unloaded,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export default new LocalInferenceService();
