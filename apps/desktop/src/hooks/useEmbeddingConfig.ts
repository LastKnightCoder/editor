import useSettingStore from "@/stores/useSettingStore";
import { resolveEmbeddingModelInfoFromSetting } from "@/utils/embedding-model-info";

const useEmbeddingConfig = () => {
  const embedding = useSettingStore(state => state.setting.embedding);
  return resolveEmbeddingModelInfoFromSetting({ embedding });
};

export default useEmbeddingConfig;
