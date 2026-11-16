import useSettingStore from "@/stores/useSettingStore";
import type { ImageProviderConfig } from "@/types/imageGeneration";

export const getActiveImageGenerationConfig = (): ImageProviderConfig | null => {
  const { currentProviderId, providers } = useSettingStore.getState().setting.imageGeneration;
  return providers.find(provider => provider.id === currentProviderId) ?? null;
};
