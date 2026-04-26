import { Editor } from "slate";
import useBlockPanelStore from "../stores/useBlockPanelStore";

const getSelectionPosition = () => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  return {
    x: rect.left,
    y: rect.top + rect.height,
  };
};

export const withSlashCommands = (editor: Editor) => {
  const { insertText } = editor;

  editor.insertText = (text) => {
    const state = useBlockPanelStore.getState();
    const { blockPanelVisible, ownerEditor, inputValue, list, reset } = state;
    const isOwner = ownerEditor === editor;

    if (text === "/" && (!blockPanelVisible || !isOwner || list.length === 0)) {
      const position = getSelectionPosition();
      if (position) {
        useBlockPanelStore.setState({
          blockPanelVisible: true,
          ownerEditor: editor,
          position,
          inputValue: "/",
          list: [],
          activePath: [],
          interactionMode: "keyboard",
        });
      }
      insertText(text);
      return;
    }

    if (blockPanelVisible && isOwner) {
      if (text === " ") {
        reset();
      } else {
        const position = getSelectionPosition();
        if (position) {
          useBlockPanelStore.setState({
            inputValue: inputValue + text,
            position,
          });
        }
      }
    }
    insertText(text);
  };

  return editor;
};
