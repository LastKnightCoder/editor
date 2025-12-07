import { Role } from "@/constants";
import type { ToolCallPayload } from "./tool";

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
  timestamp: number;
  duration?: number;
  retryCount?: number;
  isRetrying?: boolean;
}

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
    key: string;
    model: string;
    baseUrl: string;
    distance: number;
    dimensions: number;
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
