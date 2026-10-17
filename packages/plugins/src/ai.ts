export interface PluginAIFeature {
  id: string;
  name: string;
  description?: string;
}

export interface PluginAIRequest {
  feature: string;
  messages: readonly { role: "system" | "user" | "assistant"; content: string }[];
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

export interface PluginAI {
  getStatus(feature: string): Promise<{ configured: boolean; enabled: boolean }>;
  openSettings(feature?: string): void;
  chat(request: PluginAIRequest): Promise<PluginAIResult>;
  stream(request: PluginAIRequest): AsyncIterable<PluginAIEvent>;
}

export const unavailableAI: PluginAI = {
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
