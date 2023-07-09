import {Editor, Element as SlateElement, Transforms} from "slate";
import {
  getClosestCurrentElement,
  getElementParent,
  getParentNodeByNode, getPrevPath,
  isAtParagraphStart, isCheckListItemElement,
  isParagraphElement
} from "../../utils";
import { CheckListItemElement } from "../../types";

const checkList = (editor: Editor) => {
  const { deleteBackward } = editor;
  editor.deleteBackward = (unit) => {
    if (isAtParagraphStart(editor) && isCheckListItemElement(getElementParent(editor)![0])) {
      // 如果是最后一个 list-item, wrap bulleted-list or numbered-list
      const curPara = getClosestCurrentElement(editor);
      if (curPara[1][curPara[1].length - 1] === 0) {
        const curList = getParentNodeByNode(editor, curPara[0]);
        const curListWrapper = getParentNodeByNode(editor, curList[0])[0];
        if (curListWrapper.type !== 'check-list') {
          throw new Error('当前 check-list-item 的父节点不是 check-list');
        }
        const onlyOneChild = curListWrapper.children.length === 1;
        Transforms.unwrapNodes(editor, {
          match: n => SlateElement.isElement(n) && isCheckListItemElement(n),
        });
        if (onlyOneChild) {
          Transforms.unwrapNodes(editor, {
            match: n => SlateElement.isElement(n) && n.type === curListWrapper.type,
          })
        } else {
          // 移动到上一个 list-item 中
          const prevListItemPath = getPrevPath(curList[1]);
          if (prevListItemPath) {
            const prevListElement = Editor.node(editor, prevListItemPath)[0] as CheckListItemElement;
            Transforms.moveNodes(editor, {
              to: [...prevListItemPath, prevListElement.children.length],
              match: n => SlateElement.isElement(n) && isParagraphElement(n),
            })
          }
        }
        return;
      }
    }
    deleteBackward(unit);
  }

  return editor;
}

export default checkList;