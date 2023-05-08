import { Editor } from "slate";

export const withQuitMode = (editor: Editor) => {
  const { insertText } = editor;
  editor.insertText = (text) => {
    if (editor.escMode) {
      editor.escMode = false;
      editor.insertNode({ type: 'formatted', text });
      return;
    }

    insertText(text);
  }

  return editor;
}
