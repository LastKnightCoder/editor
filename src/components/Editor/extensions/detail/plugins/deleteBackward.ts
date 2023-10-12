import {Editor, Transforms} from "slate";
import {getPreviousSiblingNode, isAtParagraphStart, isParagraphElement} from "@/components/Editor/utils";

export const deleteBackward = (editor: Editor) => {
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

    // 在 detail 中，在第一个段落的开头，按下删除键，unwrap detail
    const [detail] = Editor.nodes(editor, {
      match: n => n.type === 'detail',
      mode: 'lowest'
    });
    if (detail) {
      const [para] = Editor.nodes(editor, {
        match: n => isParagraphElement(n),
        mode: 'lowest'
      });
      if (para) {
        const [, path] = para;
        if (
          path[path.length - 1] === 0 &&
          editor.selection &&
          Editor.isStart(editor, editor.selection.anchor, path)
        ) {
          Transforms.unwrapNodes(editor, {
            match: n => n.type === 'detail',
            mode: 'lowest',
            split: true
          });
          return;
        }
      }
    }

    deleteBackward(unit);
  }

  return editor;
}
