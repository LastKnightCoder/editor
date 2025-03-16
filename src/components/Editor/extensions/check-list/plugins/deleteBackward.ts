import { Editor, NodeEntry, Transforms } from "slate";
import {
  getClosestCurrentElement,
  getElementParent,
  getParentNodeByNode,
  isAtParagraphStart,
  isCheckListItemElement,
  getPreviousSiblingNode,
  isParagraphAndEmpty,
} from "@/components/Editor/utils";
import {
  CheckListElement,
  CheckListItemElement,
  ParagraphElement,
} from "@/components/Editor/types";

export const deleteBackward = (editor: Editor) => {
  const { deleteBackward } = editor;
  editor.deleteBackward = (unit) => {
    if (
      isAtParagraphStart(editor) &&
      isCheckListItemElement(getElementParent(editor)![0])
    ) {
      const curPara = getClosestCurrentElement(editor);
      const curList = getParentNodeByNode(editor, curPara[0]);
      const curListItem = curList[0] as CheckListItemElement;
      const curListWrapper = getParentNodeByNode(
        editor,
        curList[0],
      ) as NodeEntry<CheckListElement>;

      if (curListWrapper[0].type !== "check-list") {
        console.error("当前 check-list-item 的父节点不是 check-list");
        return;
      }

      // 如果当前节点没有 CheckList，并且段落是空的，直接删除
      if (isParagraphAndEmpty(editor) && curListItem.children.length === 1) {
        Transforms.removeNodes(editor, { at: curList[1] });
        return;
      }

      // 获取前一个兄弟节点
      const prevSibling = getPreviousSiblingNode(editor, curList[0]);

      if (prevSibling) {
        // 存在前一个兄弟节点
        const [prevNode, prevPath] = prevSibling;

        if (isCheckListItemElement(prevNode)) {
          // 如果前一个节点是 CheckListItem
          // 将当前段落移动到前一个兄弟节点的 children 中
          if (prevNode.children.length === 1) {
            editor.withoutNormalizing(() => {
              // 前一个节点只有一个段落，没有子 CheckList，新建 CheckList，并插入到该 CheckList 中
              // 先创建一个新的 check-list 节点
              Transforms.insertNodes(
                editor,
                {
                  type: "check-list",
                  children: [curListItem],
                },
                { at: [...prevPath, 1] },
              );

              Transforms.removeNodes(editor, { at: curList[1] });
              Transforms.select(
                editor,
                Editor.start(editor, [...prevPath, 1, 0]),
              );
            });
            return;
          } else {
            const prevNodeChildren = prevNode.children;
            const checkListNode = prevNodeChildren[1] as CheckListElement;
            Transforms.insertNodes(editor, curListItem, {
              at: [...prevPath, 1, checkListNode.children.length],
            });
            Transforms.removeNodes(editor, { at: curList[1] });
            // select 到新的位置的开头
            Transforms.select(
              editor,
              Editor.start(editor, [
                ...prevPath,
                1,
                checkListNode.children.length,
              ]),
            );
            return;
          }
        } else {
          console.error("前一个节点不是 CheckListItem");
        }
      } else {
        // 没有前一个兄弟节点
        if (curListItem.children.length === 1) {
          // 只有一个段落，没有子 CheckList
          // 将自己变为段落，插入到父级 CheckList 前面
          const paragraph = curListItem.children[0] as ParagraphElement;
          const checkListPath = curListWrapper[1];

          editor.withoutNormalizing(() => {
            // 先删除当前节点
            Transforms.removeNodes(editor, { at: curList[1] });

            // 插入段落到 check-list 前面
            Transforms.insertNodes(editor, paragraph, { at: checkListPath });

            // 将光标移动到新段落
            Transforms.select(editor, Editor.start(editor, checkListPath));
          });
        } else {
          // 有子 CheckList，什么也不做
          deleteBackward(unit);
        }
      }

      return;
    }

    deleteBackward(unit);
  };

  return editor;
};
