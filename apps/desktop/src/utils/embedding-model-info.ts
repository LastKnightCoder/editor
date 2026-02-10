import type { ISetting } from "@/stores/useSettingStore";
import type { SearchParams } from "@/types/search";
import {
  DEFAULT_LOCAL_EMBEDDING_DISTANCE,
  LOCAL_EMBEDDING_CONFIG_ID,
} from "@/constants/embedding";

type EmbeddingModelInfo = SearchParams["modelInfo"];

export const resolveEmbeddingModelInfoFromProvider = (
  embeddingProvider: ISetting["embeddingProvider"] | undefined,
): EmbeddingModelInfo | undefined => {
  if (!embeddingProvider?.currentConfigId) {
    return undefined;
  }

  const currentConfig = embeddingProvider.configs.find(
    (config) => config.id === embeddingProvider.currentConfigId,
  );
  if (!currentConfig?.currentModel) {
    return undefined;
  }

  const currentModel = currentConfig.models.find(
    (model) => model.name === currentConfig.currentModel,
  );
  if (!currentModel) {
    return undefined;
  }

  const providerType: "remote_openai" | "local_python" =
    currentConfig.providerType === "local_python" ||
    currentConfig.id === LOCAL_EMBEDDING_CONFIG_ID
      ? "local_python"
      : "remote_openai";

  if (providerType === "remote_openai") {
    if (!currentConfig.apiKey || !currentConfig.baseUrl) {
      return undefined;
    }
  }

  const distance =
    currentModel.distance ||
    (providerType === "local_python" ? DEFAULT_LOCAL_EMBEDDING_DISTANCE : 0);

  if (distance <= 0) {
    return undefined;
  }

  return {
    configId: currentConfig.id,
    providerType,
    key: currentConfig.apiKey,
    baseUrl: currentConfig.baseUrl,
    model: currentModel.name,
    distance,
    dimensions: currentModel.contextLength,
    batchSize: currentConfig.batchSize,
    devicePolicy: currentConfig.devicePolicy || "auto",
    localModelDir: currentConfig.localModelDir,
  };
};

export const resolveEmbeddingModelInfoFromSetting = (
  setting: ISetting,
): EmbeddingModelInfo | undefined => {
  return resolveEmbeddingModelInfoFromProvider(setting.embeddingProvider);
};
