export type {
  PiApiKind,
  PiThinkingLevel,
  PiCatalogProvider,
  PiCatalogModel,
  PiDiscoveredModel,
  LLMModelCost,
  LLMModelSetting,
  LLMProviderSetting,
  LLMUsageConfigV2,
} from "@tau/ai/models";
import type { PiThinkingLevel } from "@tau/ai/models";
import type { UsageSource } from "./model-usage";

/** 单发请求（渲染进程 → 主进程 pi-ai 模块）：消息字段名对齐 pi 的 Message，单发场景 content 收窄为纯文本 */
export interface PiSingleShotRequest {
  requestId: string;
  providerId: string;
  modelId: string;
  system?: string;
  messages: {
    role: "user" | "assistant";
    content: string;
    /** 仅 user 消息：随文本一起发送的图片（base64，不带 data: 前缀） */
    images?: { data: string; mimeType: string }[];
  }[];
  thinking?: PiThinkingLevel;
  temperature?: number;
  maxOutputTokens?: number;
  /** 用量审计归属（功能 / 实体 / 知识库） */
  source?: UsageSource;
}

export interface PiSingleShotOutcome {
  ok: boolean;
  message?: import("@earendil-works/pi-ai").AssistantMessage;
  error?: string;
}
