import type { Disposable, JsonValue } from "./contract";

export interface EmbeddingInstance {
  /** 返回与 texts 等长、同序的向量 */
  embed(texts: string[], signal: AbortSignal): Promise<number[][]>;
}

export interface EmbeddingProviderDefinition {
  id: string;
  name: string;
  /** 单次 embed 可接受的最大文本条数；宿主据此分批 */
  maxBatchSize?: number;
  /** 创建时不发网络请求 */
  create(config: JsonValue, modelId: string): EmbeddingInstance;
}

export interface PluginEmbeddings {
  register(definition: EmbeddingProviderDefinition): Disposable;
}
