import { Role } from "@/constants";
import type { ToolCallPayload } from "./tool";
import type { EmbeddingProviderType } from "./embedding";

export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageContent {
  type: "image";
  image: string; // base64 或 url
  resourceId?: number;
}

export interface FileContent {
  type: "file";
  file: string;
  resourceId?: number;
  fileName?: string;
}

export type MessageContent = TextContent | ImageContent | FileContent;
export type ReasoningEffort = "none" | "low" | "medium" | "high";

export interface RequestMessage {
  role: Role;
  content: MessageContent[] | string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCallPayload[];
}

export interface ToolCallExecutionState {
  toolCallId: string;
  toolName: string;
  status: "pending" | "executing" | "success" | "failed" | "retrying";
  input: string;
  output?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  /** 错误类型：parameter 为参数错误（已反馈模型纠正），execution 为执行失败（已自动重试） */
  errorType?: "parameter" | "execution";
  timestamp: number;
  duration?: number;
  /** 自动重试次数（仅用于执行失败的自动重试场景） */
  retryCount?: number;
}

export type AssistantBlockState = "streaming" | "final";

export interface AssistantTextBlock {
  id: string;
  turnId: string;
  type: "text";
  state: AssistantBlockState;
  content: string;
}

export interface AssistantReasoningBlock {
  id: string;
  turnId: string;
  type: "reasoning";
  state: AssistantBlockState;
  content: string;
  startTime?: number;
  endTime?: number;
  duration?: number;
}

export interface AssistantToolCallBlock {
  id: string;
  turnId: string;
  type: "tool_call";
  state: AssistantBlockState;
  toolCall: ToolCallPayload;
  execution?: ToolCallExecutionState;
}

export type AssistantBlock =
  | AssistantTextBlock
  | AssistantReasoningBlock
  | AssistantToolCallBlock;

// 内容块类型：支持文本、思考、工具调用按顺序交替出现
export type ResponseContentBlock =
  | {
      type: "text";
      content: string;
    }
  | {
      type: "reasoning";
      content: string;
      startTime?: number; // 开始思考的时间戳（毫秒）
      endTime?: number; // 结束思考的时间戳（毫秒）
      duration?: number; // 思考持续时间（毫秒）
    }
  | {
      type: "tool_calls";
      executions: ToolCallExecutionState[];
    };

export interface ResponseMessage {
  role: Role;
  content: string;
  reasoning_content?: string;
  tool_calls?: ToolCallPayload[];
  tool_executions?: ToolCallExecutionState[];
  assistant_blocks?: AssistantBlock[];
  // 新增：有序内容块数组
  content_blocks?: ResponseContentBlock[];
}

export type ChatSessionMessage = RequestMessage | ResponseMessage;

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

export interface ModelConfig {
  name: string;
  description: string;
  features: ModelFeatures;
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
