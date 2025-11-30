import { create } from "zustand";
import { Editor } from "slate";

import { IBlockPanelListItem } from "../types";

const getListAtLevel = (
  items: IBlockPanelListItem[],
  path: number[],
  level: number,
): IBlockPanelListItem[] => {
  if (level <= 0) return items;

  let current: IBlockPanelListItem[] = items;
  for (let i = 0; i < level; i++) {
    const index = path[i];
    if (index == null) return [];
    const parent = current[index];
    if (!parent || !parent.children || parent.children.length === 0) {
      return [];
    }
    current = parent.children;
  }

  return current;
};

const getItemByPath = (
  items: IBlockPanelListItem[],
  path: number[],
): IBlockPanelListItem | undefined => {
  if (path.length === 0) return undefined;

  let currentList: IBlockPanelListItem[] = items;
  let currentItem: IBlockPanelListItem | undefined;

  for (let i = 0; i < path.length; i++) {
    const index = path[i];
    currentItem = currentList[index];
    if (!currentItem) return undefined;
    currentList = currentItem.children ?? [];
  }

  return currentItem;
};

const getInitialActivePath = (items: IBlockPanelListItem[]) =>
  items.length > 0 ? [0] : [];

type InteractionMode = "keyboard" | "pointer";

interface IState {
  blockPanelVisible: boolean;
  position: {
    x: number;
    y: number;
  };
  inputValue: string;
  list: IBlockPanelListItem[];
  activePath: number[];
  interactionMode: InteractionMode;
}

interface IActions {
  filterList: (value: string, allListItem: IBlockPanelListItem[]) => void;
  setActiveIndex: (next: boolean) => void;
  selectItem: (editor: Editor, targetPath?: number[]) => void;
  enterSubmenu: () => void;
  exitSubmenu: () => void;
  setActivePath: (path: number[]) => void;
  getActiveItem: () => IBlockPanelListItem | undefined;
  reset: () => void;
}

const initState: IState = {
  blockPanelVisible: false,
  position: {
    x: 0,
    y: 0,
  },
  inputValue: "",
  list: [],
  activePath: [],
  interactionMode: "keyboard",
};

const useBlockPanelStore = create<IState & IActions>((set, get) => ({
  ...initState,
  filterList: (value: string, allListItem: IBlockPanelListItem[]) => {
    const searchText = value.slice(1);
    if (!searchText) {
      set({
        list: allListItem,
        activePath: getInitialActivePath(allListItem),
        interactionMode: "keyboard",
      });
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
      activePath: getInitialActivePath(list),
      interactionMode: "keyboard",
    });
  },
  setActiveIndex: (next: boolean) => {
    const { list, activePath } = get();
    if (list.length === 0) return;

    if (activePath.length === 0) {
      set({
        activePath: getInitialActivePath(list),
        interactionMode: "keyboard",
      });
      return;
    }

    const level = activePath.length - 1;
    const currentList = getListAtLevel(list, activePath, level);

    if (currentList.length === 0) {
      set({
        activePath: activePath.slice(0, level),
        interactionMode: "keyboard",
      });
      return;
    }

    const currentIndex = Math.min(
      activePath[level] ?? 0,
      currentList.length - 1,
    );
    const nextIndex = next
      ? (currentIndex + 1) % currentList.length
      : (currentIndex + currentList.length - 1) % currentList.length;

    const newPath = [...activePath];
    newPath[level] = nextIndex;
    set({ activePath: newPath, interactionMode: "keyboard" });
  },
  selectItem: (editor: Editor, targetPath?: number[]) => {
    const { list, inputValue, reset, activePath } = get();
    const path = targetPath ?? activePath;
    if (path.length === 0) return;

    const item = getItemByPath(list, path);
    if (!item) return;

    if (item.children && !item.onClick) {
      return;
    }

    if (item.onClick) {
      const deleteCount = inputValue.length;
      for (let i = 0; i < deleteCount; i++) {
        editor.deleteBackward("character");
      }
      item.onClick(editor);
      reset();
    }
  },
  enterSubmenu: () => {
    const { list, activePath } = get();
    if (activePath.length === 0) return;

    const item = getItemByPath(list, activePath);
    if (!item || !item.children || item.children.length === 0) return;

    set({
      activePath: [...activePath, 0],
      interactionMode: "keyboard",
    });
  },
  exitSubmenu: () => {
    const { activePath } = get();
    if (activePath.length <= 1) return;

    set({
      activePath: activePath.slice(0, activePath.length - 1),
      interactionMode: "keyboard",
    });
  },
  setActivePath: (path: number[]) => {
    const { activePath } = get();
    const isSameLength = path.length === activePath.length;
    const isSame =
      isSameLength &&
      path.every((value, index) => value === activePath[index]);

    if (isSame) return;

    set({ activePath: [...path], interactionMode: "pointer" });
  },
  getActiveItem: () => {
    const { list, activePath } = get();
    return getItemByPath(list, activePath);
  },
  reset: () => {
    set({
      ...initState,
    });
  },
}));

export default useBlockPanelStore;
