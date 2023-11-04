import { Editor, Element as SlateElement, Transforms } from "slate";
import {
  isAtParagraphStart,
  isListItemElement,
  getElementParent,
  getClosestCurrentElement,
  getParentNodeByNode,
  getPrevPath,
  isParagraphElement,
  isParagraphAndEmpty
} from "@/components/Editor/utils";
import { ListItemElement } from "@/components/Editor/types";

// 在 list-item 中按下删除
export const deleteListItem = (editor: Editor): boolean => {
  const parentElement = getElementParent(editor);
  if (!parentElement) {
    return false;
  }
  if (isAtParagraphStart(editor) && isListItemElement(parentElement[0])) {
    // 如果是最后一个 list-item, wrap bulleted-list or numbered-list
    const curPara = getClosestCurrentElement(editor);
    if (curPara[1][curPara[1].length - 1] === 0) {
      const curList = getParentNodeByNode(editor, curPara[0]);
      const curListWrapper = getParentNodeByNode(editor, curList[0])[0];
      const onlyOneChild = curListWrapper.children.length === 1;
      Transforms.unwrapNodes(editor, {
        match: n => SlateElement.isElement(n) && isListItemElement(n),
      });
      if (onlyOneChild) {
        Transforms.unwrapNodes(editor, {
          match: n => SlateElement.isElement(n) && n.type === curListWrapper.type,
        })
      } else {
        // 移动到上一个 list-item 中
        const prevListItemPath = getPrevPath(curList[1]);
        if (prevListItemPath) {
          const prevListElement = Editor.node(editor, prevListItemPath)[0] as ListItemElement;
          Transforms.moveNodes(editor, {
            to: [...prevListItemPath, prevListElement.children.length],
            match: n => SlateElement.isElement(n) && isParagraphElement(n),
          })
        }
      }
      return true;
    }
  }
  return false;
}

export const newLineInListItem = (editor: Editor, insertBreak: () => void): boolean => {
  const [listMatch] = Editor.nodes(editor, {
    match: n => SlateElement.isElement(n)  && n.type === 'list-item',
    mode: 'lowest',
  });
  if (!listMatch) {
    return false;
  }
  const [para] = Editor.nodes(editor, {
    match: n => SlateElement.isElement(n) && isParagraphElement(n),
    mode: 'lowest',
  });
  console.log(para[1], listMatch[1]);
  // 段落
  if (para[1].length !== listMatch[1].length + 1) {
    return false;
  }
  // 在行首，并且内容为空
  if (isAtParagraphStart(editor) && para && isParagraphAndEmpty(editor)) {
    // 如果是第一个段落，并且后面没有段落，则转换为 paragraph
    if ((listMatch[0] as ListItemElement).children.length === 1) {
      Transforms.unwrapNodes(editor, {
        match: n => SlateElement.isElement(n) && isListItemElement(n),
      });
      Transforms.liftNodes(editor, {
        match: n => SlateElement.isElement(n) && isParagraphElement(n),
      });
      return true;
    }
    // 如果是最后一个段落，则将 paragraph 转换为 list-item
    if (para[1][para[1].length - 1] + 1 === (listMatch[0] as ListItemElement).children.length) {
      Transforms.wrapNodes(editor, { type: 'list-item', children: [] });
      Transforms.liftNodes(editor, {
        match: n => SlateElement.isElement(n) && n.type === 'list-item',
      });
      return true;
    }
  }
  // 不为空且是第一个段落，将 paragraph 转为 list-item
  if (para && para[1][para[1].length - 1] === 0) {
    insertBreak();
    Transforms.wrapNodes(editor, { type: 'list-item', children: [] });
    Transforms.liftNodes(editor, {
      match: n => SlateElement.isElement(n) && n.type === 'list-item',
    });
    return true;
  }
  return false;
}