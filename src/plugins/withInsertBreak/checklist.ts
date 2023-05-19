import {Editor, Element as SlateElement, Transforms} from "slate";
import {
  isAtParagraphStart,
  isCheckListItemElement,
  isParagraphElement,
  isParagraphEmpty
} from "../../utils";
import {ListItemElement, ParagraphElement} from "../../custom-types";

const checklist = (editor: Editor) => {
  const { insertBreak } = editor;
  editor.insertBreak = () => {
    const [listMatch] = Editor.nodes(editor, {
      match: n => SlateElement.isElement(n)  && n.type === 'check-list-item'
    });
    if (listMatch) {
      const [para] = Editor.nodes(editor, {
        match: n => SlateElement.isElement(n) && isParagraphElement(n),
      });
      // 在行首，并且内容为空
      if (isAtParagraphStart(editor) && para && isParagraphEmpty(para[0] as ParagraphElement)) {
        // 如果是第一个段落，并且后面没有段落，则转换为 paragraph
        if ((listMatch[0] as ListItemElement).children.length === 1) {
          Transforms.unwrapNodes(editor, {
            match: n => SlateElement.isElement(n) && isCheckListItemElement(n),
          });
          Transforms.liftNodes(editor, {
            match: n => SlateElement.isElement(n) && isParagraphElement(n),
          });
          return;
        }
        // 如果是最后一个段落，则将 paragraph 转换为 list-item
        if (para[1][para[1].length - 1] + 1 === (listMatch[0] as ListItemElement).children.length) {
          Transforms.wrapNodes(editor, { type: 'check-list-item', checked: false, children: [] });
          Transforms.liftNodes(editor, {
            match: n => SlateElement.isElement(n) && n.type === 'check-list-item',
          });
          return;
        }
      }
      // 不为空且是第一个段落，将 paragraph 转为 list-item
      if (para && para[1][para[1].length - 1] === 0) {
        insertBreak();
        Transforms.wrapNodes(editor, { type: 'check-list-item', checked: false, children: [] });
        Transforms.liftNodes(editor, {
          match: n => SlateElement.isElement(n) && n.type === 'check-list-item',
        });
        return;
      }
    }
    insertBreak();
  }

  return editor;
}

export default checklist;