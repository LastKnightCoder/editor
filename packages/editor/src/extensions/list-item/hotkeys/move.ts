import { IHotKeyConfig } from "../../../types";
import { Editor, Transforms, NodeEntry } from "slate";
import { getParentNodeByNode } from "../../../utils";
import {
  BulletedListElement,
  ListItemElement,
  NumberedListElement,
} from "../../../types";

export const move: IHotKeyConfig[] = [
  {
    hotKey: "Mod+ArrowUp",
    action: (editor, event) => {
      const [listItemMatch] = Editor.nodes(editor, {
        match: (n) => n.type === "list-item",
        mode: "lowest",
      }) as unknown as NodeEntry<ListItemElement>[];

      if (!listItemMatch) {
        return;
      }

      const [listItem, listItemPath] = listItemMatch;
      const parentList = getParentNodeByNode(editor, listItem) as NodeEntry<
        BulletedListElement | NumberedListElement
      >;

      if (
        !parentList ||
        !["bulleted-list", "numbered-list"].includes(parentList[0].type)
      ) {
        return;
      }

      const [, parentListPath] = parentList;
      const currentIndex = listItemPath[listItemPath.length - 1];

      // 如果已经在最上面，则不调整
      if (currentIndex === 0) {
        return;
      }

      event.preventDefault();

      // 移动到前一个位置
      const newPath = [...parentListPath, currentIndex - 1];
      Transforms.moveNodes(editor, {
        at: listItemPath,
        to: newPath,
      });
    },
  },
  {
    hotKey: "Mod+ArrowDown",
    action: (editor, event) => {
      const [listItemMatch] = Editor.nodes(editor, {
        match: (n) => n.type === "list-item",
        mode: "lowest",
      }) as unknown as NodeEntry<ListItemElement>[];

      if (!listItemMatch) {
        return;
      }

      const [listItem, listItemPath] = listItemMatch;
      const parentList = getParentNodeByNode(editor, listItem) as NodeEntry<
        BulletedListElement | NumberedListElement
      >;

      if (
        !parentList ||
        !["bulleted-list", "numbered-list"].includes(parentList[0].type)
      ) {
        return;
      }

      const [parentListNode, parentListPath] = parentList;
      const currentIndex = listItemPath[listItemPath.length - 1];
      const listLength = parentListNode.children.length;

      // 如果已经在最下面，则不调整
      if (currentIndex === listLength - 1) {
        return;
      }

      event.preventDefault();

      // 移动到后一个位置
      const newPath = [...parentListPath, currentIndex + 1];
      Transforms.moveNodes(editor, {
        at: listItemPath,
        to: newPath,
      });
    },
  },
];
