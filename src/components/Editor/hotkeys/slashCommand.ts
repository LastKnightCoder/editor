import { IHotKeyConfig } from "../types";
import useBlockPanelStore from "../stores/useBlockPanelStore.ts";

export const slashCommandConfig: IHotKeyConfig[] = [
  {
    hotKey: "esc",
    action: (_editor, event) => {
      // 关闭 blockPanel
      const { blockPanelVisible, reset } = useBlockPanelStore.getState();
      if (blockPanelVisible) {
        reset();
        event.preventDefault();
        event.stopPropagation();
      }
    },
  },
  {
    hotKey: "backspace",
    action: () => {
      // 关闭 blockPanel
      const { blockPanelVisible, inputValue, reset } =
        useBlockPanelStore.getState();
      if (blockPanelVisible) {
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
    action: (_editor, event) => {
      // 选择下一个
      const { blockPanelVisible, setActiveIndex } =
        useBlockPanelStore.getState();
      if (blockPanelVisible) {
        setActiveIndex(true);
        event.preventDefault();
      }
    },
  },
  {
    hotKey: "up",
    action: (_editor, event) => {
      // 选择上一个
      const { blockPanelVisible, setActiveIndex } =
        useBlockPanelStore.getState();
      if (blockPanelVisible) {
        setActiveIndex(false);
        event.preventDefault();
      }
    },
  },
  {
    hotKey: "enter",
    action: (editor, event) => {
      const { blockPanelVisible, selectItem, activeIndex } =
        useBlockPanelStore.getState();
      if (blockPanelVisible) {
        selectItem(editor, activeIndex);
        event.preventDefault();
      }
    },
  },
];
