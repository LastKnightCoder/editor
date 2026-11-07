import useSettingStore from "@/stores/useSettingStore";
import type { LLMModelSetting, LLMProviderSetting, PiThinkingLevel } from "@/types/pi-llm";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadCatalogModels } from "@/services/llmCatalog";

interface LLMConfigResult {
  provider: LLMProviderSetting | null;
  model: LLMModelSetting | null;
  /** 该功能的推理档位；undefined = 未指定，交由 runtime 按模型能力取默认 */
  thinkingLevel?: PiThinkingLevel;
}

export const useLLMConfig = (
  feature:
    | "chat"
    | "titleSummary"
    | "webClip"
    | "flashcardGeneration"
    | "transcriptionOptimization"
    | "speechInputRefinement"
    | "videoSummary"
    | "videoEbookRewrite"
    | "vibeLearningImageDescription"
    | "contentMetadata"
    | "contentInsights"
): LLMConfigResult => {
  const llmProviders = useSettingStore(state => state.setting.llmProviders);
  const llmUsageSettings = useSettingStore(state => state.setting.llmUsageSettings);

  const usageConfig = llmUsageSettings[feature];
  const provider = llmProviders.find(config => config.id === usageConfig?.providerId);
  const model = provider?.models.find(item => item.id === usageConfig?.modelId);
  const builtin = provider?.builtin;
  const { data: catalog } = useQuery({
    queryKey: ["llm", "catalog", builtin],
    queryFn: () => loadCatalogModels(builtin!),
    enabled: Boolean(builtin),
    staleTime: Infinity,
  });
  const effectiveModel = useMemo(() => {
    const current = catalog?.find(item => item.id === model?.id);
    return model && current
      ? { ...model, contextWindow: current.contextWindow, maxTokens: current.maxTokens }
      : model;
  }, [catalog, model]);

  if (!usageConfig) {
    return {
      provider: null,
      model: null,
    };
  }

  if (!provider) {
    return {
      provider: null,
      model: null,
    };
  }

  return {
    provider,
    model: effectiveModel || null,
    thinkingLevel: usageConfig.thinkingLevel,
  };
};

export default useLLMConfig;
