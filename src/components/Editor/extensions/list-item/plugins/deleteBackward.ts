import { Editor } from 'slate';
import { deleteListItem } from "../utils.ts";

const deleteBackward = (editor: Editor) => {
  const { deleteBackward } = editor;

  editor.deleteBackward = (unit) => {
    const hit = deleteListItem(editor);
    if (hit) {
      return;
    }
    deleteBackward(unit);
  }

  return editor;
}

export default deleteBackward;