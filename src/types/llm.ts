import { Role } from "@/constants";

export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageContent {
  type: "image";
  image: string; // base64 或 url
}

export interface FileContent {
  type: "file";
  file: string;
}

export type MessageContent = TextContent | ImageContent | FileContent;

export interface RequestMessage {
  role: Role;
  content: MessageContent[];
}

export interface ResponseMessage {
  role: Role;
  content: string;
  reasoning_content?: string;
}

export type ChatSessionMessage = RequestMessage | ResponseMessage;

export interface ProviderConfig {
  id: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  models: ModelConfig[];
}

export interface ModelConfig {
  name: string;
  description: string;
  features: {
    online: boolean;
    thinking: boolean;
    multimodal: boolean;
  };
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
