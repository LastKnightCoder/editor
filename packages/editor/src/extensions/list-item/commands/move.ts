import { Editor, Transforms, NodeEntry } from "slate";

import type { EditorCommand } from "../../../api";
import { getParentNodeByNode } from "../../../utils";
import type { BulletedListElement, ListItemElement, NumberedListElement } from "../../../types";

/** mod+↑：把当前列表项在同级内上移一格（已是最上则不动） */
export const moveUp: EditorCommand = {
  id: "tau.list-item.move-up",
  title: "上移列表项",
  run: (editor, ctx) => {
    const [listItemMatch] = Editor.nodes(editor, {
      match: n => n.type === "list-item",
      mode: "lowest",
    }) as unknown as NodeEntry<ListItemElement>[];

    if (!listItemMatch) {
      return;
    }

    const [listItem, listItemPath] = listItemMatch;
    const parentList = getParentNodeByNode(editor, listItem) as NodeEntry<
      BulletedListElement | NumberedListElement
    >;

    if (!parentList || !["bulleted-list", "numbered-list"].includes(parentList[0].type)) {
      return;
    }

    const [, parentListPath] = parentList;
    const currentIndex = listItemPath[listItemPath.length - 1];

    // 如果已经在最上面，则不调整
    if (currentIndex === 0) {
      return;
    }

    ctx.event?.preventDefault();

    // 移动到前一个位置
    const newPath = [...parentListPath, currentIndex - 1];
    Transforms.moveNodes(editor, {
      at: listItemPath,
      to: newPath,
    });
  },
};

/** mod+↓：把当前列表项在同级内下移一格（已是最下则不动） */
export const moveDown: EditorCommand = {
  id: "tau.list-item.move-down",
  title: "下移列表项",
  run: (editor, ctx) => {
    const [listItemMatch] = Editor.nodes(editor, {
      match: n => n.type === "list-item",
      mode: "lowest",
    }) as unknown as NodeEntry<ListItemElement>[];

    if (!listItemMatch) {
      return;
    }

    const [listItem, listItemPath] = listItemMatch;
    const parentList = getParentNodeByNode(editor, listItem) as NodeEntry<
      BulletedListElement | NumberedListElement
    >;

    if (!parentList || !["bulleted-list", "numbered-list"].includes(parentList[0].type)) {
      return;
    }

    const [parentListNode, parentListPath] = parentList;
    const currentIndex = listItemPath[listItemPath.length - 1];
    const listLength = parentListNode.children.length;

    // 如果已经在最下面，则不调整
    if (currentIndex === listLength - 1) {
      return;
    }

    ctx.event?.preventDefault();

    // 移动到后一个位置
    const newPath = [...parentListPath, currentIndex + 1];
    Transforms.moveNodes(editor, {
      at: listItemPath,
      to: newPath,
    });
  },
};
