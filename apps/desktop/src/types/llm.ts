import type { EmbeddingProviderKind } from "./embedding";

/**
 * 消息模型统一维护在 @tau/shared/chat-core/messages.ts，本文件仅 re-export；
 * 此处保留的是桌面端 LLM 设置相关类型（ProviderConfig / ModelConfig / RAG 等）。
 */
export type {
  TextContent,
  ImageContent,
  FileContent,
  MessageContent,
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

export interface ModelFeatures {
  online: boolean;
  thinking: boolean;
  image: boolean;
  video: boolean;
  audio: boolean;
  file: boolean;
  multimodal?: boolean;
}

// RAG 知识库选项
export interface KnowledgeOptions {
  enable: boolean;
  modelInfo?: {
    provider: EmbeddingProviderKind;
    pluginId?: string;
    model: string;
    distance: number;
    dimensions: number;
    batchSize?: number;
    devicePolicy?: "auto" | "cpu" | "cuda";
  };
  limit: number;
}

// RAG 配置选项
export interface RAGConfig {
  enabled: boolean;
  searchLimit: number;
}
