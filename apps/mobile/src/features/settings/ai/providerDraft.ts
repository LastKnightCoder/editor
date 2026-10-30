import type { PiApiKind } from "@tau/ai/models";
import type { MobileLlmProvider } from "../../../types";

export type ModelSetting = MobileLlmProvider["models"][number];

export const API_OPTIONS: ReadonlyArray<{ value: PiApiKind; label: string }> = [
  { value: "openai-completions", label: "OpenAI Chat Completions" },
  { value: "openai-responses", label: "OpenAI Responses" },
  { value: "anthropic-messages", label: "Anthropic Messages" },
];

export interface ProviderDraft {
  provider: MobileLlmProvider;
  /** 空串表示保持原 Key 不变 */
  apiKey: string;
}

export type DraftErrors = Partial<Record<"name" | "baseUrl" | "models", string>>;

export function validateDraft(draft: ProviderDraft): DraftErrors {
  const errors: DraftErrors = {};
  const { provider } = draft;
  if (!provider.name.trim()) errors.name = "请填写名称";
  try {
    const url = new URL(provider.baseUrl.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
  } catch {
    errors.baseUrl = "请填写 http(s) 开头的地址";
  }
  if (!provider.models.length) errors.models = "至少保留一个模型";
  return errors;
}

/** 手填模型：目录外模型必须给出容量，运行时据此截断上下文与输出 */
export function customModel(input: {
  id: string;
  name: string;
  contextWindow: string;
  maxTokens: string;
  reasoning: boolean;
  image: boolean;
}): ModelSetting | string {
  const id = input.id.trim();
  if (!id) return "请填写模型 ID";
  const contextWindow = Number(input.contextWindow);
  const maxTokens = Number(input.maxTokens);
  if (!Number.isSafeInteger(contextWindow) || contextWindow <= 0) return "上下文窗口须为正整数";
  if (!Number.isSafeInteger(maxTokens) || maxTokens <= 0) return "最大输出须为正整数";
  return {
    id,
    ...(input.name.trim() ? { name: input.name.trim() } : {}),
    reasoning: input.reasoning,
    input: input.image ? ["text", "image"] : ["text"],
    contextWindow,
    maxTokens,
  };
}

export function sameDraft(a: ProviderDraft, b: ProviderDraft) {
  return a.apiKey === b.apiKey && JSON.stringify(a.provider) === JSON.stringify(b.provider);
}

export const formatTokens = (value: number | undefined) =>
  !value ? "" : value >= 1000 ? `${Math.round(value / 1000)}K` : String(value);
