import localInference from "./local-inference";
import type { DevicePolicy } from "./local-inference";
import type { EmbeddingProviderKind } from "@/types/embedding";
import { pluginEmbeddingsRelay } from "../services/plugin-embeddings";
import userSettingModule from "./user-setting";

/** 插件提供方缺省分批大小（提供方未声明 maxBatchSize 时使用） */
const DEFAULT_PLUGIN_EMBEDDING_BATCH_SIZE = 32;

/** 嵌入目标：调用方从各自设置/配置解析出的最小参数集 */
export interface EmbeddingTarget {
  provider: EmbeddingProviderKind;
  /** provider === "plugin" 时的来源插件 */
  pluginId?: string;
  model: string;
  dimensions: number;
  batchSize?: number;
  devicePolicy?: DevicePolicy;
}

export interface EmbedTextsOptions {
  /** 查询等用户在等结果的场景传 true，本地推理按 interactive 优先级插队 */
  interactive?: boolean;
  /** 批次完成后回调（进度展示用） */
  onProgress?: (current: number, total: number) => void;
  /** 插件提供方透传给渲染宿主的取消信号 */
  signal?: AbortSignal;
}

class EmbeddingService {
  async embedTexts(
    target: EmbeddingTarget,
    texts: string[],
    options?: EmbedTextsOptions
  ): Promise<number[][]> {
    if (!texts.length) {
      return [];
    }
    if (target.provider !== "local") {
      return this.embedViaPlugin(target, texts, options);
    }
    // 本地推理不传 modelDir，localInference 缺省走 userData/embedding-models
    const result = await localInference.embedTexts(texts, {
      modelName: target.model,
      batchSize: target.batchSize || 8,
      devicePolicy: target.devicePolicy || "auto",
      priority: options?.interactive ? "interactive" : "background",
    });
    options?.onProgress?.(texts.length, texts.length);

    const embeddings = result.embeddings || [];
    if (!embeddings.length) {
      return [];
    }
    this.assertDimensionsMatch(embeddings, target.dimensions);
    return embeddings;
  }

  /** 插件提供方：主进程分批转发给渲染宿主执行，批次大小受提供方 maxBatchSize 约束 */
  private async embedViaPlugin(
    target: EmbeddingTarget,
    texts: string[],
    options?: EmbedTextsOptions
  ): Promise<number[][]> {
    const pluginId = target.pluginId?.trim();
    if (!pluginId) throw new Error("嵌入插件尚未配置");
    const setting = await userSettingModule.getSettingSnapshot();
    const config = setting?.embedding?.plugins?.[pluginId]?.config;
    if (config === undefined) throw new Error("嵌入插件尚未配置");
    const batchSize =
      pluginEmbeddingsRelay.maxBatchSize(pluginId) ?? DEFAULT_PLUGIN_EMBEDDING_BATCH_SIZE;
    const embeddings: number[][] = [];
    for (let start = 0; start < texts.length; start += batchSize) {
      const batch = texts.slice(start, start + batchSize);
      embeddings.push(
        ...(await pluginEmbeddingsRelay.embed(
          pluginId,
          config,
          target.model,
          batch,
          options?.signal
        ))
      );
      options?.onProgress?.(Math.min(start + batchSize, texts.length), texts.length);
    }
    if (embeddings.length) {
      this.assertDimensionsMatch(embeddings, target.dimensions);
    }
    return embeddings;
  }

  /** 维度不符直接失败，避免错维度向量写库后检索损坏 */
  private assertDimensionsMatch(embeddings: number[][], expected: number): void {
    if (expected && embeddings[0] && embeddings[0].length !== expected) {
      throw new Error(`Embedding 维度不匹配：配置 ${expected}，实际 ${embeddings[0].length}`);
    }
  }
}

export default new EmbeddingService();
