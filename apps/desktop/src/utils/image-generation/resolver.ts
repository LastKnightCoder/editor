import {
  ImageProviderFactory,
  type ImageProviderConfig,
  type IImageGenerationProvider,
} from "./provider-factory";
import useSettingStore from "@/stores/useSettingStore";
export type {
  ImageProviderConfig,
  IImageGenerationProvider,
} from "./provider-factory";

export const isImageGenerationAvailable = (): boolean => {
  const { imageGeneration } = useSettingStore.getState().setting;
  const { currentProviderId, providers } = imageGeneration;
  if (!currentProviderId) return false;
  const config = providers.find((p) => p.id === currentProviderId);
  if (!config) return false;
  return Boolean(
    config.baseUrl?.trim() && config.apiKey?.trim() && config.modelName?.trim(),
  );
};

export const getActiveImageGenerationConfig =
  (): ImageProviderConfig | null => {
    const { imageGeneration } = useSettingStore.getState().setting;
    const { currentProviderId, providers } = imageGeneration;
    if (!currentProviderId) return null;
    return providers.find((p) => p.id === currentProviderId) ?? null;
  };

export const getActiveImageGenerationProvider =
  (): IImageGenerationProvider | null => {
    const config = getActiveImageGenerationConfig();
    if (!config) return null;
    return ImageProviderFactory.createProvider(config);
  };

export const createProviderFromConfig = (
  config: ImageProviderConfig,
): IImageGenerationProvider => {
  return ImageProviderFactory.createProvider(config);
};
