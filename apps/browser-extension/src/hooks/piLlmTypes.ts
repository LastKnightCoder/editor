/** 桌面端 v2 LLM 设置（pi 对齐）的扩展侧镜像——经 settings.* RPC 传输的载荷形状 */
export type PiApiKind = "openai-completions" | "openai-responses" | "anthropic-messages";
export type PiThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface LLMModelSetting {
  id: string;
  name?: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  contextWindow: number;
  maxTokens: number;
  thinkingLevel?: PiThinkingLevel;
  samplingParams?: Record<string, unknown>;
  headers?: Record<string, string>;
  compat?: Record<string, unknown>;
  stripThinkTags?: boolean;
}

export interface LLMProviderSetting {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  api: PiApiKind;
  models: LLMModelSetting[];
}
