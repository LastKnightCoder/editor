import { create } from "zustand";
import { IBlockPanelListItem } from "../types/blockPanel.ts";
import {Editor, Transforms} from "slate";
import { blockPanelList } from '../configs';

interface IState {
  blockPanelVisible: boolean;
  position: {
    x: number;
    y: number;
  },
  activeIndex: number;
  inputValue: string;
  list: IBlockPanelListItem[];
}

interface IActions {
  filterList: (value: string) => void;
  setActiveIndex: (next: boolean) => void;
  selectItem: (editor: Editor) => void;
  reset: () => void;
}

const initState: IState = {
  blockPanelVisible: false,
  position: {
    x: 0,
    y: 0,
  },
  activeIndex: 0,
  inputValue: '',
  list: blockPanelList,
}

const useBlockPanelStore = create<IState & IActions>((set, get) => ({
  ...initState,
  filterList: (value: string) => {
    const list = blockPanelList.filter(item => {
      return (
        item.keywords.some(keyword => keyword.includes(value)) ||
        item.title.includes(value) ||
        item.description.includes(value)
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
      })
    } else {
      set({
        activeIndex: (activeIndex + list.length - 1) % list.length,
      })
    }
  },
  selectItem: (editor: Editor) => {
    const { list, activeIndex, inputValue } = get();
    const deleteCount = inputValue.length + 1;
    for (let i = 0; i < deleteCount; i++) {
      editor.deleteBackward('character');
    }
    const item = list[activeIndex];
    item.onClick(editor);
    Transforms.move(editor, {
      unit: 'line',
    });
    set({
      ...initState,
    });
  },
  reset: () => {
    set({
      ...initState,
    });
  }
}));

export default useBlockPanelStore;
