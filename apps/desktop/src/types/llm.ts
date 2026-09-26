import type { EmbeddingProviderType } from "./embedding";

/**
 * 消息模型统一维护在 @tau/shared/chat-core/messages.ts，本文件仅 re-export；
 * 此处保留的是桌面端 LLM 设置相关类型（ProviderConfig / ModelConfig / RAG 等）。
 */
export type {
  TextContent,
  ImageContent,
  FileContent,
  MessageContent,
  ReasoningEffort,
  ProviderMetadata,
  ToolCallPayload,
  ToolCallExecutionState,
  AssistantBlockState,
  AssistantTextBlock,
  AssistantReasoningBlock,
  AssistantToolCallBlock,
  AssistantBlock,
  ResponseContentBlock,
  ResponseMessage,
  ModelUsage,
  ChatSessionMessage,
  RequestMessage,
} from "@tau/shared";

export interface ProviderConfig {
  id: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  models: ModelConfig[];
}

export interface ModelFeatures {
  online: boolean;
  thinking: boolean;
  image: boolean;
  video: boolean;
  audio: boolean;
  file: boolean;
  multimodal?: boolean;
}

export type MessageFormat = "openai" | "claude";
export type LLMApiProtocol = "chat-completions" | "responses";

export interface ModelConfig {
  name: string;
  description: string;
  features: ModelFeatures;
  messageFormat?: MessageFormat;
  apiProtocol?: LLMApiProtocol;
  /** 最大输出 token。Claude Messages API 使用 max_tokens，未配置时使用应用默认值。 */
  maxOutputTokens?: number;
  /** 上下文窗口大小，单位为 k tokens。 */
  contextWindowK?: number;
  /** 可选的请求 User-Agent。 */
  userAgent?: string;
  /** 可选的采样温度。 */
  temperature?: number;
}

export interface LLMUsageConfig {
  providerId: string;
  modelName: string;
}

// RAG 知识库选项
export interface KnowledgeOptions {
  enable: boolean;
  modelInfo?: {
    providerType?: EmbeddingProviderType;
    key?: string;
    model: string;
    baseUrl?: string;
    distance: number;
    dimensions: number;
    batchSize?: number;
    devicePolicy?: "auto" | "cpu" | "cuda";
    localModelDir?: string;
  };
  limit: number;
}

// RAG 配置选项
export interface RAGConfig {
  enabled: boolean;
  searchLimit: number;
  embeddingProvider?: {
    id: string;
    modelName: string;
  };
}
