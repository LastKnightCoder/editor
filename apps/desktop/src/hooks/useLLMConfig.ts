import useSettingStore from "@/stores/useSettingStore";
import type { LLMModelSetting, LLMProviderSetting } from "@/types/pi-llm";

interface LLMConfigResult {
  provider: LLMProviderSetting | null;
  model: LLMModelSetting | null;
}

export const useLLMConfig = (
  feature:
    | "chat"
    | "titleSummary"
    | "webClip"
    | "podcastGeneration"
    | "flashcardGeneration"
    | "aiJudgement"
    | "transcriptionOptimization"
    | "videoSummary"
    | "videoEbookRewrite"
): LLMConfigResult => {
  const llmProviders = useSettingStore(state => state.setting.llmProviders);
  const llmUsageSettings = useSettingStore(state => state.setting.llmUsageSettings);

  const usageConfig = llmUsageSettings[feature];

  if (!usageConfig) {
    return {
      provider: null,
      model: null,
    };
  }

  const provider = llmProviders.find(config => config.id === usageConfig.providerId);

  if (!provider) {
    return {
      provider: null,
      model: null,
    };
  }

  const model = provider.models?.find(model => model.id === usageConfig.modelId);

  return {
    provider,
    model: model || null,
  };
};

export default useLLMConfig;
