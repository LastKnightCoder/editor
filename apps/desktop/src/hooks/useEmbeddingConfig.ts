import useSettingStore from "@/stores/useSettingStore";

const useEmbeddingConfig = () => {
  const embeddingProvider = useSettingStore(
    (state) => state.setting.embeddingProvider,
  );
  const { currentConfigId } = embeddingProvider;
  const currentConfig = embeddingProvider.configs.find(
    (config) => config.id === currentConfigId,
  );
  const currentModel = currentConfig?.models.find(
    (model) => model.name === currentConfig.currentModel,
  );

  if (!currentConfig || !currentModel) {
    return undefined;
  }

  return {
    baseUrl: currentConfig.baseUrl,
    key: currentConfig.apiKey,
    model: currentModel.name,
    distance: currentModel.distance,
    dimensions: currentModel.contextLength,
  };
};

export default useEmbeddingConfig;
