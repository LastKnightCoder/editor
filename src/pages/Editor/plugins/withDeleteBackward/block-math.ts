import {Editor, Element as SlateElement, Range, Transforms} from "slate";
import { ParagraphElement} from "../../custom-types";
import {isAtParagraphStart, isParagraphEmpty} from "../../utils";

const blockMath = (editor: Editor) => {
  const { deleteBackward } = editor;

  editor.deleteBackward = (unit) => {
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      const [match] = Editor.nodes(editor, {
        match: n => SlateElement.isElement(n) && editor.isBlock(n),
      });
      if (match) {
        const [node, path] = match;
        if (isAtParagraphStart(editor)) {
          // 如果前一个是 code-block，删除当前 paragraph，将光标移动到 code-block 的末尾
          const prevPath = Editor.before(editor, path);
          if (prevPath) {
            const [prevMatch] = Editor.nodes(editor, {
              at: prevPath,
              match: n => SlateElement.isElement(n) && n.type === 'block-math',
            });
            if (prevMatch) {
              if (isParagraphEmpty(node as ParagraphElement)) {
                Transforms.removeNodes(editor, { at: path });
                Transforms.move(editor, { distance: -2, unit: 'line' });
              }
              return;
            }
          }
        }
      }
    }
    deleteBackward(unit);
  }

  return editor;
}

export default blockMath;