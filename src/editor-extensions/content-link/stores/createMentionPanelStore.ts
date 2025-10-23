import { create } from "zustand";
import { Editor } from "slate";
import { SearchResult } from "@/types";
import { wrapContentLink } from "../components/utils";
import {
  IMentionPanelState,
  IMentionPanelActions,
} from "./MentionPanelContext";

const defaultPanelState: IMentionPanelState = {
  mentionPanelVisible: false,
  position: {
    x: 0,
    y: 0,
  },
  activeIndex: 0,
  inputValue: "",
  searchResults: [],
  loading: false,
};

export const createMentionPanelStore = (editor: Editor) => {
  return create<IMentionPanelState & IMentionPanelActions>((set, get) => ({
    ...defaultPanelState,

    setState: (newState: Partial<IMentionPanelState>) => {
      set(newState);
    },

    setSearchResults: (results: SearchResult[]) => {
      set({ searchResults: results, activeIndex: 0 });
    },

    setLoading: (loading: boolean) => {
      set({ loading });
    },

    setActiveIndex: (next: boolean) => {
      const { searchResults, activeIndex } = get();
      if (searchResults.length === 0) return;

      if (next) {
        set({
          activeIndex: (activeIndex + 1) % searchResults.length,
        });
      } else {
        set({
          activeIndex:
            (activeIndex + searchResults.length - 1) % searchResults.length,
        });
      }
    },

    selectItem: (selectIndex: number) => {
      const { searchResults, inputValue, reset } = get();
      if (searchResults.length === 0) return;

      const deleteCount = inputValue.length;
      for (let i = 0; i < deleteCount; i++) {
        editor.deleteBackward("character");
      }

      const item = searchResults[selectIndex];
      // 使用用户输入的文字（去掉 @ 符号）作为显示文本
      const displayText = inputValue.slice(1); // 移除开头的 @
      wrapContentLink(
        editor,
        item.contentId,
        item.type,
        item.title,
        item.id,
        displayText,
      );

      reset();
    },

    reset: () => {
      set({ ...defaultPanelState });
    },
  }));
};
