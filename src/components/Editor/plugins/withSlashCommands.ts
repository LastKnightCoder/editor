import { Editor } from "slate";
import useBlockPanelStore from "../stores/useBlockPanelStore.ts";

export const withSlashCommands = (editor: Editor) => {
  const { insertText } = editor;

  editor.insertText = (text) => {
    const state = useBlockPanelStore.getState();
    const { blockPanelVisible, inputValue, reset } = state;
    if (text === '/') {
      if (!blockPanelVisible) {
        // 获取当前鼠标的位置
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          const position = {
            x: rect.left,
            y: rect.top + rect.height,
          }
          useBlockPanelStore.setState({
            blockPanelVisible: true,
            position,
            inputValue: '/',
          });
        }
      }
    }
    if (blockPanelVisible) {
      if (text === ' ') {
        reset();
      } else {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          const position = {
            x: rect.left,
            y: rect.top + rect.height,
          }
          useBlockPanelStore.setState({
            inputValue: inputValue + text,
            position,
          });
        }
      }
    }
    insertText(text);
  }

  return editor;
}
