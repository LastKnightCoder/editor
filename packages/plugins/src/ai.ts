export interface PluginAIFeature {
  id: string;
  name: string;
  description?: string;
}

export const PLUGIN_AI_CAPABILITIES = {
  chat: { name: "对话功能" },
  titleSummary: { name: "标题总结" },
  webClip: { name: "网页剪藏" },
  podcastGeneration: { name: "播客生成" },
  flashcardGeneration: { name: "闪卡制作" },
  aiJudgement: { name: "答案评判" },
  transcriptionOptimization: { name: "转录断句优化" },
  videoSummary: { name: "视频总结" },
  videoEbookRewrite: { name: "视频电子书重写" },
  vibeLearningImageDescription: { name: "图片理解" },
  contentMetadata: { name: "笔记元信息" },
  contentInsights: { name: "AI 洞见" },
} as const;

export type PluginAICapability = keyof typeof PLUGIN_AI_CAPABILITIES;
export const isPluginAICapability = (value: unknown): value is PluginAICapability =>
  typeof value === "string" && Object.hasOwn(PLUGIN_AI_CAPABILITIES, value);

export interface PluginAIImage {
  /** 不带 data: 前缀的 Base64 图片字节。 */
  data: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
}

export type PluginAIMessage =
  | { role: "system" | "assistant"; content: string }
  | { role: "user"; content: string; images?: readonly PluginAIImage[] };

export interface PluginAIRequest {
  feature: string;
  messages: readonly PluginAIMessage[];
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface PluginAIResult {
  text: string;
  /** 供应商未报告用量时为 null。 */
  usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
}

export type PluginAIEvent =
  { type: "text"; delta: string } | { type: "done"; result: PluginAIResult };

export interface PluginAIFeatures {
  getStatus(feature: string): Promise<{ configured: boolean; enabled: boolean }>;
  openSettings(feature?: string): void;
  chat(request: PluginAIRequest): Promise<PluginAIResult>;
  stream(request: PluginAIRequest): AsyncIterable<PluginAIEvent>;
}

export type PluginAICapabilityRequest = Omit<PluginAIRequest, "feature">;

export interface PluginAICapabilityClient {
  chat(request: PluginAICapabilityRequest): Promise<PluginAIResult>;
  stream(request: PluginAICapabilityRequest): AsyncIterable<PluginAIEvent>;
}

export interface PluginAI extends PluginAIFeatures {
  /** 申请使用应用已有模型分配的 AI 能力；需在 manifest 声明对应 ai:<能力名> 权限。 */
  requestCapability(capability: PluginAICapability): Promise<PluginAICapabilityClient>;
}

export const unavailableAI: PluginAI = {
  async requestCapability() {
    throw new Error("AI_UNAVAILABLE：当前宿主不支持 AI 能力");
  },
  async getStatus() {
    return { configured: false, enabled: false };
  },
  openSettings() {
    throw new Error("AI_UNAVAILABLE：当前宿主不支持 AI");
  },
  async chat() {
    throw new Error("AI_UNAVAILABLE：当前宿主不支持 AI");
  },
  stream() {
    throw new Error("AI_UNAVAILABLE：当前宿主不支持 AI");
  },
};
