import { Editor, Range, Transforms } from "slate";

export const inlineCode = (editor: Editor) => {
  const { insertText } = editor;

  editor.insertText = (text) => {
    if (text === "`") {
      const { selection } = editor;
      if (selection && !Range.isCollapsed(selection)) {
        Editor.addMark(editor, "code", true);
        Transforms.collapse(editor, { edge: "end" });
        return;
      }
    }
    insertText(text);
  };

  return editor;
};
