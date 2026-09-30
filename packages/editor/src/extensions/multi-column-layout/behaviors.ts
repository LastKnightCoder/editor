import { Element, Transforms } from "slate";

import type { ElementBehaviors } from "../../api";
import type { MultiColumnContainerElement, MultiColumnItemElement } from "../../types";
import { hitEmptyOrInlineChild, isParagraphAndEmpty } from "../../utils";

/** 多列布局没有子元素时删除容器并补空段落 */
const normalizeContainer: ElementBehaviors<MultiColumnContainerElement>["normalize"] = (
  editor,
  [node, path]
) => {
  if (node.children.length !== 0) return false;
  Transforms.delete(editor, {
    at: path,
  });
  Transforms.insertNodes(
    editor,
    {
      type: "paragraph",
      children: [
        {
          type: "formatted",
          text: "",
        },
      ],
    },
    {
      select: true,
    }
  );
  return true;
};

/** 列内只剩一个空段落时退格：删除当前列 */
const deleteBackward: ElementBehaviors<MultiColumnItemElement>["deleteBackward"] = (
  editor,
  [node, path]
) => {
  // 当只有一个空段落的时候，将当前的列删除
  if (node.children.length > 1) return false;
  const child = node.children[0];
  if (child.type !== "paragraph") return false;
  if (!isParagraphAndEmpty(editor)) return false;
  Transforms.delete(editor, {
    at: path,
  });
  return true;
};

/** 列的子节点只允许块级元素：空 / 裸文本子节点清掉或包进段落 */
const normalizeItem: ElementBehaviors<MultiColumnItemElement>["normalize"] = (editor, entry) =>
  hitEmptyOrInlineChild(editor, entry as unknown as [Element, number[]], "multi-column-item");

export const multiColumnContainerBehaviors: ElementBehaviors<MultiColumnContainerElement> = {
  normalize: normalizeContainer,
};

export const multiColumnItemBehaviors: ElementBehaviors<MultiColumnItemElement> = {
  deleteBackward,
  normalize: normalizeItem,
};
