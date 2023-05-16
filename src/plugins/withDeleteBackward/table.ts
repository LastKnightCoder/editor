import {Editor, Element as SlateElement, Range, Transforms} from "slate";
import {isAtParagraphStart, isParagraphElement, isParagraphEmpty, movePrevCol} from "../../utils";
import { ParagraphElement } from "../../custom-types";

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
      if (isAtParagraphStart(editor)) {
        const [match] = Editor.nodes(editor, {
          match: n => SlateElement.isElement(n) && isParagraphElement(n),
        });
        const [node, path] = match;
        // 如果前一个是 code-block，删除当前 paragraph，将光标移动到 code-block 的末尾
        const prevPath = Editor.before(editor, path);
        if (prevPath) {
          const [prevMatch] = Editor.nodes(editor, {
            at: prevPath,
            match: n => SlateElement.isElement(n) && n.type === 'table',
          });
          if (prevMatch) {
            if (isParagraphEmpty(node as ParagraphElement)) {
              Transforms.removeNodes(editor, { at: path });
            }
            console.log('prevMatch', prevMatch);
            Transforms.move(editor, { distance: -1, unit: 'line' });
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