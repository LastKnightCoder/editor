import useSettingStore from "@/stores/useSettingStore";
import { resolveEmbeddingModelInfoFromProvider } from "@/utils/embedding-model-info";

const useEmbeddingConfig = () => {
  const embeddingProvider = useSettingStore(
    (state) => state.setting.embeddingProvider,
  );
  return resolveEmbeddingModelInfoFromProvider(embeddingProvider);
};

export default useEmbeddingConfig;
