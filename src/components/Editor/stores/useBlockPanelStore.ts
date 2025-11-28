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
  inSubmenu: boolean;
  parentIndex: number;
  submenuList: IBlockPanelListItem[];
}

interface IActions {
  filterList: (value: string, allListItem: IBlockPanelListItem[]) => void;
  setActiveIndex: (next: boolean) => void;
  selectItem: (editor: Editor, selectIndex: number) => void;
  enterSubmenu: (parentIndex: number) => void;
  exitSubmenu: () => void;
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
  inSubmenu: false,
  parentIndex: -1,
  submenuList: [],
};

const useBlockPanelStore = create<IState & IActions>((set, get) => ({
  ...initState,
  filterList: (value: string, allListItem: IBlockPanelListItem[]) => {
    const searchText = value.slice(1);
    if (!searchText) {
      set({ list: allListItem, inSubmenu: false, activeIndex: 0 });
      return;
    }

    // 递归搜索，扁平化显示所有匹配的叶子节点
    const flattenAndFilter = (
      items: IBlockPanelListItem[],
    ): IBlockPanelListItem[] => {
      const result: IBlockPanelListItem[] = [];

      items.forEach((item) => {
        const matches =
          item.keywords.some((keyword) => keyword.includes(searchText)) ||
          item.title.includes(searchText) ||
          item.description.includes(searchText);

        if (item.children) {
          // 如果有子项，递归搜索子项
          result.push(...flattenAndFilter(item.children));
        } else if (matches) {
          // 如果是叶子节点且匹配，添加到结果
          result.push(item);
        }
      });

      return result;
    };

    const list = flattenAndFilter(allListItem);
    set({
      list,
      inSubmenu: false,
      activeIndex: 0,
    });
  },
  setActiveIndex: (next: boolean) => {
    const { list, submenuList, inSubmenu, activeIndex } = get();
    const currentList = inSubmenu ? submenuList : list;

    if (currentList.length === 0) return;

    if (next) {
      set({
        activeIndex: (activeIndex + 1) % currentList.length,
      });
    } else {
      set({
        activeIndex:
          (activeIndex + currentList.length - 1) % currentList.length,
      });
    }
  },
  selectItem: (editor: Editor, selectIndex) => {
    const { list, submenuList, inSubmenu, inputValue, reset } = get();
    const currentList = inSubmenu ? submenuList : list;
    const item = currentList[selectIndex];

    if (!item) return;

    // 如果有子菜单且没有 onClick，不执行任何操作（应该通过右键进入）
    if (item.children && !item.onClick) {
      return;
    }

    // 执行操作
    if (item.onClick) {
      const deleteCount = inputValue.length;
      for (let i = 0; i < deleteCount; i++) {
        editor.deleteBackward("character");
      }
      item.onClick(editor);
      reset();
    }
  },
  enterSubmenu: (parentIndex: number) => {
    const { list } = get();
    const parentItem = list[parentIndex];

    if (
      !parentItem ||
      !parentItem.children ||
      parentItem.children.length === 0
    ) {
      return;
    }

    set({
      inSubmenu: true,
      parentIndex,
      submenuList: parentItem.children,
      activeIndex: 0,
    });
  },
  exitSubmenu: () => {
    const { parentIndex } = get();
    set({
      inSubmenu: false,
      submenuList: [],
      activeIndex: parentIndex >= 0 ? parentIndex : 0,
    });
  },
  reset: () => {
    set({
      ...initState,
    });
  },
}));

export default useBlockPanelStore;
