import { create } from 'zustand';
import { produce } from 'immer';
import { VecDocument } from "@/types";
import { embeddingOpenAI, searchVecDocuments } from '@/commands';
import useSettingStore, { ELLMProvider } from './useSettingStore'

interface ICommandPanelState {
  open: boolean;
  action?: 'search' | 'setting';
  input: string;
  searchResult: Array<[VecDocument, number]>;
}

interface ICommandPanelActions {
  toggleTheme: () => void;
  onSearch: (input: string) => Promise<Array<[VecDocument, number]>>;
}

const EMBEDDING_MODEL = 'text-embedding-3-large';
const TOP_K = 10;

const useCommandPanelStore = create<ICommandPanelState & ICommandPanelActions>((set) => ({
  open: false,
  action: undefined,
  input: '',
  searchResult: [],
  toggleTheme: () => {
    useSettingStore.setState(produce(useSettingStore.getState(), (draft) =>{
      draft.setting.darkMode = !draft.setting.darkMode;
    }));
  },
  onSearch: async (input: string) => {
    const settings = useSettingStore.getState().setting;
    const { configs, currentConfigId } = settings.llmProviders[ELLMProvider.OPENAI];
    const currentConfig = configs.find(config => config.id === currentConfigId);
    if (!currentConfig) return [];
    const { apiKey, baseUrl } = currentConfig;
    const queryEmbedding = await embeddingOpenAI(apiKey, baseUrl, EMBEDDING_MODEL, input);
    const searchResult = await searchVecDocuments(queryEmbedding, TOP_K);
    set({
      searchResult
    });

    return searchResult;
  },
}));

export default useCommandPanelStore;
