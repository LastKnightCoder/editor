import { createContext } from "react";
import { StoreApi } from "zustand";
import { SearchResult } from "@/types";

export interface IMentionPanelState {
  mentionPanelVisible: boolean;
  position: {
    x: number;
    y: number;
  };
  activeIndex: number;
  inputValue: string;
  searchResults: SearchResult[];
  loading: boolean;
}

export interface IMentionPanelActions {
  setSearchResults: (results: SearchResult[]) => void;
  setLoading: (loading: boolean) => void;
  setActiveIndex: (next: boolean) => void;
  selectItem: (selectIndex: number) => void;
  reset: () => void;
  setState: (state: Partial<IMentionPanelState>) => void;
}

export type MentionPanelStoreType = StoreApi<
  IMentionPanelState & IMentionPanelActions
>;

export const MentionPanelContext = createContext<MentionPanelStoreType | null>(
  null,
);
