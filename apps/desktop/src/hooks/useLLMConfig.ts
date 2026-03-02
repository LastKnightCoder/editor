import useSettingStore from "@/stores/useSettingStore";
import type { ProviderConfig, ModelConfig } from "@/types/llm";

interface LLMConfigResult {
  providerConfig: ProviderConfig | null;
  modelConfig: ModelConfig | null;
}

export const useLLMConfig = (
  feature:
    | "chat"
    | "titleSummary"
    | "aiContinueWrite"
    | "webClip"
    | "podcastGeneration"
    | "flashcardGeneration"
    | "aiJudgement"
    | "autoTagging"
    | "transcriptionOptimization"
    | "videoSummary"
    | "videoEbookRewrite",
): LLMConfigResult => {
  const llmConfigs = useSettingStore((state) => state.setting.llmConfigs);
  const llmUsageSettings = useSettingStore(
    (state) => state.setting.llmUsageSettings,
  );

  const usageConfig = llmUsageSettings[feature];

  if (!usageConfig) {
    return {
      providerConfig: null,
      modelConfig: null,
    };
  }

  const providerConfig = llmConfigs.find(
    (config) => config.id === usageConfig.providerId,
  );

  if (!providerConfig) {
    return {
      providerConfig: null,
      modelConfig: null,
    };
  }

  const modelConfig = providerConfig.models?.find(
    (model) => model.name === usageConfig.modelName,
  );

  return {
    providerConfig,
    modelConfig: modelConfig || null,
  };
};

export default useLLMConfig;
