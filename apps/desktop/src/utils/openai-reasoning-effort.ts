import type { ModelConfig, ReasoningEffort } from "@/types";

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
  modelConfig: ModelConfig | null,
): readonly ReasoningEffort[] => {
  if (!modelConfig) {
    return DEFAULT_REASONING_EFFORT_OPTIONS;
  }

  if (/^gpt-5\.6(?:[.-]|$)/i.test(modelConfig.name)) {
    return GPT_5_6_REASONING_EFFORT_OPTIONS;
  }

  return /^gpt-5\.[2-5](?:[.-]|$)/i.test(modelConfig.name)
    ? XHIGH_REASONING_EFFORT_OPTIONS
    : DEFAULT_REASONING_EFFORT_OPTIONS;
};

export const normalizeReasoningEffort = (
  reasoningEffort: ReasoningEffort,
  supportedOptions: readonly ReasoningEffort[],
): ReasoningEffort =>
  supportedOptions.includes(reasoningEffort) ? reasoningEffort : "high";
