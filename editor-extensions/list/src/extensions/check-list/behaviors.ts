import { Editor, NodeEntry, Path, Range, Element as SlateElement, Transforms } from "slate";

import type { ElementBehaviors } from "@tau/editor/api";
import type { CheckListElement, CheckListItemElement, ParagraphElement } from "../../types";
import {
  getClosestCurrentElement,
  getElementParent,
  getParentNodeByNode,
  getPreviousSiblingNode,
  isAtParagraphStart,
  isCheckListItemElement,
  isParagraphAndEmpty,
} from "../../utils";
import { needsNewTaskId, normalizeTaskIds } from "./taskId";

/** 勾选项内回车：空段落退出列表（嵌套时提升一级）；非空末尾插入未勾选新项；其余默认拆行 */
const insertBreak: ElementBehaviors<CheckListItemElement>["insertBreak"] = editor => {
  const [listMatch] = Editor.nodes(editor, {
    match: n => SlateElement.isElement(n) && n.type === "check-list-item",
    mode: "lowest",
  });
  if (!listMatch) return false;

  const [paragraphMatch] = Editor.nodes(editor, {
    match: n => SlateElement.isElement(n) && n.type === "paragraph",
    mode: "lowest",
  });

  // 在行首，并且内容为空
  if (isParagraphAndEmpty(editor)) {
    const [, checkListItemPath] = listMatch;
    const parent = Editor.parent(editor, checkListItemPath);

    if (parent[0].type === "check-list") {
      const checkListPath = parent[1];
      const checkList = parent[0];
      const itemIndex = checkListItemPath[checkListItemPath.length - 1];

      // 判断是否是最后一个 check-list-item
      const isLastItem = itemIndex === checkList.children.length - 1;

      if (isLastItem) {
        let grandParent = null;
        try {
          grandParent = Editor.parent(editor, checkListPath);
        } catch {
          // 没有祖父节点（check-list 在文档顶层）
        }

        if (grandParent && grandParent[0].type === "check-list-item") {
          // 把自己移动到 grandParent 的后面
          Editor.withoutNormalizing(editor, () => {
            Transforms.moveNodes(editor, {
              at: checkListItemPath,
              to: Path.next(grandParent[1]),
            });
          });
        } else {
          // 把自己转化为一个段落，在父级 check-list 之后
          Editor.withoutNormalizing(editor, () => {
            Transforms.removeNodes(editor, {
              at: checkListItemPath,
            });

            Transforms.insertNodes(
              editor,
              {
                type: "paragraph",
                children: [{ type: "formatted", text: "" }],
              },
              {
                at: Path.next(checkListPath),
              }
            );

            Transforms.select(editor, Path.next(checkListPath));
          });
        }
      } else {
        // 不是最后一个，在后面插入一个 check-list-item，带有一个空段落
        Editor.withoutNormalizing(editor, () => {
          Transforms.insertNodes(
            editor,
            {
              type: "check-list-item",
              checked: false,
              children: [
                {
                  type: "paragraph",
                  children: [{ type: "formatted", text: "" }],
                },
              ],
            },
            {
              at: Path.next(checkListItemPath),
            }
          );

          Transforms.select(editor, [...Path.next(checkListItemPath), 0, 0]);
        });
      }
      return true;
    }
    // 父不是 check-list（异常结构）：落入下方非空分支的判断，与旧实现一致
  }

  // 非空段落：在第一个段落的末尾回车时插入未勾选的新条目
  if (paragraphMatch) {
    const [, checkListItemPath] = listMatch;
    const [, paragraphPath] = paragraphMatch;
    const { selection } = editor;

    if (
      selection &&
      Range.isCollapsed(selection) &&
      paragraphPath.length === checkListItemPath.length + 1 &&
      paragraphPath[paragraphPath.length - 1] === 0 &&
      Editor.isEnd(editor, selection.anchor, paragraphPath)
    ) {
      Editor.withoutNormalizing(editor, () => {
        Transforms.insertNodes(
          editor,
          {
            type: "check-list-item",
            checked: false,
            children: [
              {
                type: "paragraph",
                children: [{ type: "formatted", text: "" }],
              },
            ],
          },
          {
            at: Path.next(checkListItemPath),
          }
        );

        Transforms.select(editor, [...Path.next(checkListItemPath), 0, 0]);
      });
      return true;
    }
  }

  // 其余（中间拆行等）交给默认行为
  return false;
};

/** 勾选项内段首退格：空段落按层级退化（列表消解 / 删项 / 提为段落），非空并入或新建子列表 */
const deleteBackward: ElementBehaviors<CheckListItemElement>["deleteBackward"] = editor =>
  runDeleteBackward(editor);

// 保留原实现的完整退格逻辑（较长的嵌套处理），独立函数便于原样搬运
function runDeleteBackward(editor: Editor): boolean {
  if (!isAtParagraphStart(editor)) return false;
  const elementParent = getElementParent(editor);
  if (!elementParent || !isCheckListItemElement(elementParent[0])) return false;

  const curPara = getClosestCurrentElement(editor);
  if (!curPara) return false;
  const curList = getParentNodeByNode(editor, curPara[0]);
  const curListItem = curList[0] as CheckListItemElement;
  const curListWrapper = getParentNodeByNode(editor, curList[0]) as NodeEntry<CheckListElement>;

  if (curListWrapper[0].type !== "check-list") {
    console.error("当前 check-list-item 的父节点不是 check-list");
    return true;
  }

  // 如果当前节点没有子 CheckList，并且段落是空的，按列表层级决定如何退化
  if (isParagraphAndEmpty(editor) && curListItem.children.length === 1) {
    const checkListPath = curListWrapper[1];
    const onlyItemInCheckList = curListWrapper[0].children.length === 1;
    const checkListParent = Editor.parent(editor, checkListPath);
    const isNestedCheckList = checkListParent[0].type === "check-list-item";

    if (onlyItemInCheckList && !isNestedCheckList) {
      editor.withoutNormalizing(() => {
        Transforms.removeNodes(editor, { at: checkListPath });
        Transforms.insertNodes(
          editor,
          {
            type: "paragraph",
            children: [{ type: "formatted", text: "" }],
          },
          { at: checkListPath }
        );
        Transforms.select(editor, Editor.start(editor, checkListPath));
      });
    } else {
      Transforms.removeNodes(editor, { at: curList[1] });
    }
    return true;
  }

  // 获取前一个兄弟节点
  const prevSibling = getPreviousSiblingNode(editor, curList[0]);

  if (prevSibling) {
    const [prevNode, prevPath] = prevSibling;

    if (isCheckListItemElement(prevNode)) {
      // 将当前段落移动到前一个兄弟节点的 children 中
      if (prevNode.children.length === 1) {
        editor.withoutNormalizing(() => {
          // 前一个节点只有一个段落，没有子 CheckList，新建 CheckList 插进去
          Transforms.insertNodes(
            editor,
            {
              type: "check-list",
              children: [curListItem],
            },
            { at: [...prevPath, 1] }
          );

          Transforms.removeNodes(editor, { at: curList[1] });
          Transforms.select(editor, Editor.start(editor, [...prevPath, 1, 0]));
        });
        return true;
      } else {
        const prevNodeChildren = prevNode.children;
        const checkListNode = prevNodeChildren[1] as CheckListElement;
        Transforms.insertNodes(editor, curListItem, {
          at: [...prevPath, 1, checkListNode.children.length],
        });
        Transforms.removeNodes(editor, { at: curList[1] });
        Transforms.select(
          editor,
          Editor.start(editor, [...prevPath, 1, checkListNode.children.length])
        );
        return true;
      }
    } else {
      console.error("前一个节点不是 CheckListItem");
      return true;
    }
  } else {
    // 没有前一个兄弟节点
    if (curListItem.children.length === 1) {
      // 只有一个段落，将自己变为段落，插入到父级 CheckList 前面
      const paragraph = curListItem.children[0] as ParagraphElement;
      const checkListPath = curListWrapper[1];

      editor.withoutNormalizing(() => {
        Transforms.removeNodes(editor, { at: curList[1] });

        Transforms.insertNodes(editor, paragraph, { at: checkListPath });

        Transforms.select(editor, Editor.start(editor, checkListPath));
      });
      return true;
    } else {
      // 有子 CheckList，交给默认删除
      return false;
    }
  }
}

/** check-list 容器规范化：子节点只允许 check-list-item、空容器删除、相邻同类容器合并 */
const normalizeContainer: ElementBehaviors<CheckListElement>["normalize"] = (
  editor,
  [node, path]
) => {
  // 确保check-list的子节点都是check-list-item
  const children = node.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.type !== "check-list-item") {
      // 如果是 paragraph 节点，则转换为 check-list-item，否则删除
      if (child.type === "paragraph") {
        Transforms.wrapNodes(
          editor,
          {
            type: "check-list-item",
            checked: false,
            children: [child as unknown as ParagraphElement],
          },
          { at: [...path, i] }
        );
        return true;
      } else {
        Transforms.removeNodes(editor, { at: [...path, i] });
        return true;
      }
    }
  }

  // 如果check-list没有子节点，则移除它
  if (children.length === 0) {
    Transforms.removeNodes(editor, {
      at: path,
    });
    return true;
  }
  try {
    const prevNode = Editor.node(editor, Path.previous(path));
    if (prevNode[0].type === "check-list") {
      editor.withoutNormalizing(() => {
        // 提起出 children，删除当前节点，设置上一个兄弟节点
        const children = node.children;
        Transforms.removeNodes(editor, { at: path });
        Transforms.setNodes(
          editor,
          {
            type: "check-list",
            children: (prevNode as NodeEntry<CheckListElement>)[0].children.concat(children),
          },
          { at: Path.previous(path) }
        );
      });
      return true;
    }
  } catch {
    // 没有上一个兄弟节点，交给默认规范化
  }
  return false;
};

/** 勾选项规范化：必须在 check-list 中、首子节点是段落、多余子节点拆分 */
const normalizeItem: ElementBehaviors<CheckListItemElement>["normalize"] = (
  editor,
  [node, path]
) => {
  // 如果不在 check-list 中，则创建一个 check-list，并且把自己插入到 check-list 中
  if (Editor.parent(editor, path)[0].type !== "check-list") {
    Transforms.wrapNodes(editor, { type: "check-list", children: [node] }, { at: path });
    return true;
  }

  const children = node.children;

  // 确保第一个子节点是paragraph
  // @ts-ignore
  if (children.length === 0 || (children.length >= 1 && children[0].type !== "paragraph")) {
    Transforms.removeNodes(editor, { at: path });
    return true;
  }

  if (needsNewTaskId(editor, node.taskId, path)) {
    if (normalizeTaskIds(editor)) return true;
  }

  // 确保只有一个paragraph和可选的一个check-list
  if (children.length >= 2) {
    // 收集所有 paragraph 节点和 check-list 节点：找到第一个 check-list 前的所有 paragraph，后面的忽略
    const paragraphNodes: ParagraphElement[] = [];
    let checkListNode: CheckListElement | null = null;

    for (let i = 0; i < children.length; i++) {
      if (children[i].type === "paragraph") {
        paragraphNodes.push(children[i] as unknown as ParagraphElement);
      } else if (children[i].type === "check-list") {
        checkListNode = children[i] as unknown as CheckListElement;
        break;
      }
    }

    if (paragraphNodes.length > 0) {
      if (paragraphNodes.length === 1) {
        // 否则会无限循环
        return true;
      }
      editor.withoutNormalizing(() => {
        const newCheckListItems: CheckListItemElement[] = [];
        for (let i = 0; i < paragraphNodes.length - 1; i++) {
          newCheckListItems.push({
            type: "check-list-item",
            checked: false,
            children: [paragraphNodes[i]],
          });
        }

        for (let i = 0; i < paragraphNodes.length - 1; i++) {
          Transforms.removeNodes(editor, { at: [...path, i] });
        }

        const newChildren = checkListNode
          ? [paragraphNodes[paragraphNodes.length - 1], checkListNode]
          : [paragraphNodes[paragraphNodes.length - 1]];

        Transforms.setNodes(
          editor,
          {
            children: newChildren,
          },
          { at: path }
        );

        Transforms.insertNodes(editor, newCheckListItems, { at: path });
      });
      return true;
    } else {
      // 如果没有 paragraph 节点，则删除此节点
      Transforms.removeNodes(editor, { at: path });
      return true;
    }
  }
  return false;
};

export const checkListBehaviors: ElementBehaviors<CheckListElement> = {
  normalize: normalizeContainer,
};

export const checkListItemBehaviors: ElementBehaviors<CheckListItemElement> = {
  insertBreak,
  deleteBackward,
  normalize: normalizeItem,
};
