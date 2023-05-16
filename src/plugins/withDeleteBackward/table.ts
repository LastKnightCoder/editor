import {Editor, Range} from "slate";
import {movePrevCol} from "../../utils";

const table = (editor: Editor) => {
  const { deleteBackward } = editor;

  editor.deleteBackward = (unit) => {
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      const [cell] = Editor.nodes(editor, {
        match: n => n.type === 'table-cell',
      });
      if (cell) {
        const [text] = Editor.nodes(editor, {
          match: n => n.type === 'formatted',
        });
        if (text) {
          const [, path] = text;
          if (path[path.length - 1] === 0 && Editor.isStart(editor, selection.anchor, path)) {
            movePrevCol(editor);
            return;
          }
        }
      }
    }

    deleteBackward(unit);
  }

  return editor;
}

export default table;