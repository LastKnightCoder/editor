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

export type ValidationCode =
  | "nameRequired"
  | "baseUrlInvalid"
  | "modelsRequired"
  | "modelIdRequired"
  | "contextWindowInvalid"
  | "maxTokensInvalid"
  | "duplicateModel";
export type DraftErrors = Partial<Record<"name" | "baseUrl" | "models", ValidationCode>>;

export function validateDraft(draft: ProviderDraft): DraftErrors {
  const errors: DraftErrors = {};
  const { provider } = draft;
  if (!provider.name.trim()) errors.name = "nameRequired";
  try {
    const url = new URL(provider.baseUrl.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
  } catch {
    errors.baseUrl = "baseUrlInvalid";
  }
  if (!provider.models.length) errors.models = "modelsRequired";
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
}): ModelSetting | ValidationCode {
  const id = input.id.trim();
  if (!id) return "modelIdRequired";
  const contextWindow = Number(input.contextWindow);
  const maxTokens = Number(input.maxTokens);
  if (!Number.isSafeInteger(contextWindow) || contextWindow <= 0) return "contextWindowInvalid";
  if (!Number.isSafeInteger(maxTokens) || maxTokens <= 0) return "maxTokensInvalid";
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
