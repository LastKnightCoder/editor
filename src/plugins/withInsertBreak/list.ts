import {Editor, Element as SlateElement, Transforms} from "slate";
import {isAtParagraphStart, isListItemElement, isParagraphElement, isParagraphEmpty} from "../../utils";
import {ParagraphElement} from "../../custom-types";

const list = (editor: Editor) => {
  const { insertBreak } = editor;
  editor.insertBreak = () => {
    const [listMatch] = Editor.nodes(editor, {
      match: n => SlateElement.isElement(n)  && n.type === 'list-item'
    });
    if (listMatch) {
      // 在行首，并且内容为空，转为 paragraph
      if (isAtParagraphStart(editor)) {
        const [para] = Editor.nodes(editor, {
          match: n => SlateElement.isElement(n) && isParagraphElement(n),
        });
        if (para && isParagraphEmpty(para[0] as ParagraphElement)) {
          Transforms.unwrapNodes(editor, {
            match: n => SlateElement.isElement(n) && isListItemElement(n),
          });
          Transforms.liftNodes(editor, {
            match: n => SlateElement.isElement(n) && isParagraphElement(n),
          });
          return;
        }
      }
      insertBreak();
      Transforms.wrapNodes(editor, { type: 'list-item', children: [] });
      Transforms.liftNodes(editor, {
        match: n => SlateElement.isElement(n) && n.type === 'list-item',
      });
      return;
    }
    insertBreak();
  }

  return editor;

}

export default list;