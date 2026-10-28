import type { JsonValue } from "@tau/plugins";

/** 主进程 → 渲染宿主的一次性嵌入请求（无会话） */
export interface EmbeddingsRendererRequest {
  pluginId: string;
  config: JsonValue;
  modelId: string;
  texts: string[];
}

export interface EmbeddingsRendererMessage {
  requestId: string;
  hostSession: string;
  request: EmbeddingsRendererRequest;
}

export interface EmbeddingsRendererReply {
  requestId: string;
  hostSession: string;
  result?: number[][];
  error?: string;
  errorName?: string;
}

/** 渲染宿主上报的可用嵌入提供方 */
export interface EmbeddingsProviderInfo {
  pluginId: string;
  maxBatchSize?: number;
}
