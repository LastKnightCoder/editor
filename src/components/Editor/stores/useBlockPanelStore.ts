import { create } from "zustand";
import { Editor } from "slate";

import { IBlockPanelListItem } from "../types";

interface IState {
  blockPanelVisible: boolean;
  position: {
    x: number;
    y: number;
  };
  activeIndex: number;
  inputValue: string;
  list: IBlockPanelListItem[];
}

interface IActions {
  filterList: (value: string, allListItem: IBlockPanelListItem[]) => void;
  setActiveIndex: (next: boolean) => void;
  selectItem: (editor: Editor, selectIndex: number) => void;
  reset: () => void;
}

const initState: IState = {
  blockPanelVisible: false,
  position: {
    x: 0,
    y: 0,
  },
  activeIndex: 0,
  inputValue: "",
  list: [],
};

const useBlockPanelStore = create<IState & IActions>((set, get) => ({
  ...initState,
  filterList: (value: string, allListItem: IBlockPanelListItem[]) => {
    const searchText = value.slice(1);
    if (!searchText) {
      set({ list: allListItem });
      return;
    }

    const list = allListItem.filter((item) => {
      return (
        item.keywords.some((keyword) => keyword.includes(searchText)) ||
        item.title.includes(searchText) ||
        item.description.includes(searchText)
      );
    });
    set({
      list,
    });
  },
  setActiveIndex: (next: boolean) => {
    const { list, activeIndex } = get();
    if (next) {
      set({
        activeIndex: (activeIndex + 1) % list.length,
      });
    } else {
      set({
        activeIndex: (activeIndex + list.length - 1) % list.length,
      });
    }
  },
  selectItem: (editor: Editor, selectIndex) => {
    const { list, inputValue, reset } = get();
    const deleteCount = inputValue.length;
    for (let i = 0; i < deleteCount; i++) {
      editor.deleteBackward("character");
    }
    const item = list[selectIndex];
    item.onClick(editor);
    reset();
  },
  reset: () => {
    set({
      ...initState,
    });
  },
}));

export default useBlockPanelStore;
