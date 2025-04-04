import { create } from "zustand";
import { produce } from "immer";
import { SearchParams, SearchResult } from "@/types";
import { searchContent } from "@/utils";
import useSettingStore from "./useSettingStore";

interface ICommandPanelState {
  open: boolean;
  action?: "search" | "setting";
  searchLoading: boolean;
  searchResults: SearchResult[];
}

interface ICommandPanelActions {
  toggleTheme: () => void;
  onSearch: (input: string) => Promise<void>;
}

const TOP_K = 20;

const useCommandPanelStore = create<ICommandPanelState & ICommandPanelActions>(
  () => ({
    open: false,
    action: undefined,
    searchLoading: false,
    searchResults: [],
    toggleTheme: () => {
      useSettingStore.setState(
        produce(useSettingStore.getState(), (draft) => {
          draft.setting.darkMode = !draft.setting.darkMode;
        }),
      );
    },
    onSearch: async (input: string) => {
      const settings = useSettingStore.getState().setting;

      // 从 embeddingProvider 中获取模型信息
      const embeddingProvider = settings.embeddingProvider;
      const currentEmbeddingConfig = embeddingProvider.configs.find(
        (config) => config.id === embeddingProvider.currentConfigId,
      );
      const currentEmbeddingModel = currentEmbeddingConfig?.models.find(
        (model) => model.name === currentEmbeddingConfig.currentModel,
      );

      useCommandPanelStore.setState({ searchLoading: true });

      try {
        // 执行全文搜索和向量搜索
        const searchParams: SearchParams = {
          query: input,
          types: ["card", "article", "project-item", "document-item"],
          limit: TOP_K,
          modelInfo:
            currentEmbeddingConfig && currentEmbeddingModel
              ? {
                  key: currentEmbeddingConfig.apiKey,
                  baseUrl: currentEmbeddingConfig.baseUrl,
                  model: currentEmbeddingModel.name,
                  distance: currentEmbeddingModel.distance,
                }
              : undefined,
        };

        const searchResults = await searchContent(searchParams);

        useCommandPanelStore.setState({
          searchResults,
          searchLoading: false,
        });
      } catch (error) {
        console.error("搜索失败:", error);
        useCommandPanelStore.setState({ searchLoading: false });
      }
    },
  }),
);

export default useCommandPanelStore;
