import { create } from "zustand";
import { produce } from "immer";
import { SearchParams, SearchResult } from "@/types";
import { searchContent } from "@/utils/search";
import useSettingStore, { ELLMProvider } from "./useSettingStore";

interface ICommandPanelState {
  open: boolean;
  action?: "search" | "setting";
  searchLoading: boolean;
  ftsResults: SearchResult[];
  vecResults: SearchResult[];
}

interface ICommandPanelActions {
  toggleTheme: () => void;
  onSearch: (input: string) => Promise<void>;
}

const EMBEDDING_MODEL = "text-embedding-3-large";
const TOP_K = 10;

const useCommandPanelStore = create<ICommandPanelState & ICommandPanelActions>(
  () => ({
    open: false,
    action: undefined,
    searchLoading: false,
    ftsResults: [],
    vecResults: [],
    toggleTheme: () => {
      useSettingStore.setState(
        produce(useSettingStore.getState(), (draft) => {
          draft.setting.darkMode = !draft.setting.darkMode;
        }),
      );
    },
    onSearch: async (input: string) => {
      const settings = useSettingStore.getState().setting;
      const { configs, currentConfigId } =
        settings.llmProviders[ELLMProvider.OPENAI];
      const currentConfig = configs.find(
        (config) => config.id === currentConfigId,
      );

      useCommandPanelStore.setState({ searchLoading: true });

      try {
        // 执行全文搜索和向量搜索
        const searchParams: SearchParams = {
          query: input,
          types: ["card", "article", "project-item", "document-item"],
          limit: TOP_K,
          modelInfo: currentConfig
            ? {
                key: currentConfig.apiKey,
                baseUrl: currentConfig.baseUrl,
                model: EMBEDDING_MODEL,
              }
            : undefined,
        };

        const [ftsResults, vecResults] = await searchContent(searchParams);

        useCommandPanelStore.setState({
          ftsResults,
          vecResults,
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
