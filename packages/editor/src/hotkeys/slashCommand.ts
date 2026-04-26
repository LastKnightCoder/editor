import { IHotKeyConfig } from "../types";
import useBlockPanelStore from "../stores/useBlockPanelStore";

export const slashCommandConfig: IHotKeyConfig[] = [
  {
    hotKey: "backspace",
    action: (editor) => {
      // 关闭 blockPanel
      const { blockPanelVisible, ownerEditor, inputValue, reset } =
        useBlockPanelStore.getState();
      if (blockPanelVisible && ownerEditor === editor) {
        if (inputValue.length <= 1) {
          reset();
          return;
        }
        // 获取当前鼠标的位置
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          const position = {
            x: rect.left,
            y: rect.top + rect.height,
          };
          useBlockPanelStore.setState({
            inputValue: inputValue.slice(0, inputValue.length - 1),
            position,
          });
        }
      }
    },
  },
  {
    hotKey: "down",
    action: (editor, event) => {
      // 选择下一个
      const { blockPanelVisible, ownerEditor, setActiveIndex } =
        useBlockPanelStore.getState();
      if (blockPanelVisible && ownerEditor === editor) {
        setActiveIndex(true);
        event.preventDefault();
      }
    },
  },
  {
    hotKey: "up",
    action: (editor, event) => {
      // 选择上一个
      const { blockPanelVisible, ownerEditor, setActiveIndex } =
        useBlockPanelStore.getState();
      if (blockPanelVisible && ownerEditor === editor) {
        setActiveIndex(false);
        event.preventDefault();
      }
    },
  },
  {
    hotKey: "enter",
    action: (editor, event) => {
      const {
        blockPanelVisible,
        ownerEditor,
        selectItem,
        getActiveItem,
        enterSubmenu,
      } = useBlockPanelStore.getState();
      if (blockPanelVisible && ownerEditor === editor) {
        const currentItem = getActiveItem();

        // 如果当前项有子菜单且没有 onClick，进入子菜单
        if (
          currentItem?.children &&
          currentItem.children.length > 0 &&
          !currentItem.onClick
        ) {
          enterSubmenu();
        } else {
          selectItem(editor);
        }
        event.preventDefault();
      }
    },
  },
  {
    hotKey: "right",
    action: (editor, event) => {
      const { blockPanelVisible, ownerEditor, getActiveItem, enterSubmenu } =
        useBlockPanelStore.getState();
      if (!blockPanelVisible || ownerEditor !== editor) return;

      const currentItem = getActiveItem();
      if (currentItem?.children && currentItem.children.length > 0) {
        enterSubmenu();
        event.preventDefault();
      }
    },
  },
  {
    hotKey: "left",
    action: (editor, event) => {
      const { blockPanelVisible, ownerEditor, activePath, exitSubmenu } =
        useBlockPanelStore.getState();
      if (
        blockPanelVisible &&
        ownerEditor === editor &&
        activePath.length > 1
      ) {
        exitSubmenu();
        event.preventDefault();
      }
    },
  },
];
