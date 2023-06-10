import {Editor} from "slate";
import {getPreviousSiblingNode, isAtParagraphStart, isParagraphElement} from "../../utils";

const detail = (editor: Editor) => {
  const { deleteBackward } = editor;

  editor.deleteBackward = (unit) => {
    if (isAtParagraphStart(editor)) {
      const [para] = Editor.nodes(editor, {
        match: n => isParagraphElement(n)
      });
      const prevSiblingNode = getPreviousSiblingNode(editor, para[0]);
      if (prevSiblingNode) {
        const { type } = prevSiblingNode[0];
        if (type === 'detail') {
          return;
        }
      }
    }

    deleteBackward(unit);
  }

  return editor;
}

export default detail;