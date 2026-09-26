import type { ReasoningEffort } from "@/types";
import type { LLMModelSetting, LLMProviderSetting } from "@/types/pi-llm";

export const DEFAULT_REASONING_EFFORT_OPTIONS = [
  "none",
  "low",
  "medium",
  "high",
] as const satisfies readonly ReasoningEffort[];

const XHIGH_REASONING_EFFORT_OPTIONS = [
  ...DEFAULT_REASONING_EFFORT_OPTIONS,
  "xhigh",
] as const satisfies readonly ReasoningEffort[];

const GPT_5_6_REASONING_EFFORT_OPTIONS = [
  ...XHIGH_REASONING_EFFORT_OPTIONS,
  "max",
] as const satisfies readonly ReasoningEffort[];

export const getReasoningEffortOptions = (
  model: LLMModelSetting | null,
  provider?: LLMProviderSetting | null
): readonly ReasoningEffort[] => {
  if (!model) {
    return DEFAULT_REASONING_EFFORT_OPTIONS;
  }
  const modelId = model.id.toLowerCase();

  if (provider?.api === "anthropic-messages") {
    const thinkingAlwaysOn =
      /claude[-_.]?(?:fable|mythos)[-_.]?[5-9](?:[-_.]|$)/.test(modelId) ||
      /claude[-_.]?mythos[-_.]?preview/.test(modelId);
    const baseOptions = thinkingAlwaysOn
      ? DEFAULT_REASONING_EFFORT_OPTIONS.filter(option => option !== "none")
      : DEFAULT_REASONING_EFFORT_OPTIONS;
    const supportsXHigh =
      /opus[-_.]?4[-_.]?[78](?:[-_.]|$)/.test(modelId) ||
      /(?:opus|sonnet|fable|mythos)[-_.]?[5-9](?:[-_.]|$)/.test(modelId);
    const supportsMax =
      /claude.*4[-_.]?[6-9](?:[-_.]|$)/.test(modelId) ||
      /claude[-_.]?(?:opus|sonnet|fable|mythos)[-_.]?[5-9](?:[-_.]|$)/.test(modelId);

    return [
      ...baseOptions,
      ...(supportsXHigh ? (["xhigh"] as const) : []),
      ...(supportsMax ? (["max"] as const) : []),
    ];
  }

  if (/^gpt-5\.6(?:[.-]|$)/i.test(model.id)) {
    return GPT_5_6_REASONING_EFFORT_OPTIONS;
  }

  return /^gpt-5\.[2-5](?:[.-]|$)/i.test(model.id)
    ? XHIGH_REASONING_EFFORT_OPTIONS
    : DEFAULT_REASONING_EFFORT_OPTIONS;
};

export const normalizeReasoningEffort = (
  reasoningEffort: ReasoningEffort,
  supportedOptions: readonly ReasoningEffort[]
): ReasoningEffort => (supportedOptions.includes(reasoningEffort) ? reasoningEffort : "high");
