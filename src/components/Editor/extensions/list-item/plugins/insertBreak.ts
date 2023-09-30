import { Editor } from 'slate';
import { newLineInListItem } from "../utils.ts";

const insertBreak = (editor: Editor) => {
  const { insertBreak } = editor;

  editor.insertBreak = () => {
    const hit = newLineInListItem(editor, insertBreak);
    if (hit) {
      return;
    }
    insertBreak();
  }

  return editor;
}

export default insertBreak;