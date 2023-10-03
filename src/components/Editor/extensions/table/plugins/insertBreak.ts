import {Editor, Range} from "slate";

export const insertBreak = (editor: Editor) => {
  const { insertBreak } = editor;

  editor.insertBreak = () => {
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      const [match] = Editor.nodes(editor, {
        match: n => n.type === 'table-cell',
      });
      if (match) {
        return;
      }
    }
    insertBreak();
  }

  return editor;
}