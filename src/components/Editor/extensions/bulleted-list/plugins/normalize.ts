import { Editor, Transforms } from "slate";
import {
  BulletedListElement,
  NumberedListElement,
} from "@/components/Editor/types";

export const withNormalize = (editor: Editor) => {
  const { normalizeNode } = editor;

  // 如果 children 不是 list-item，wrap 一层 list-item
  editor.normalizeNode = ([node, path]) => {
    if (node.type !== "bulleted-list" && node.type !== "numbered-list") {
      return normalizeNode([node, path]);
    }
    const listElement = node as BulletedListElement | NumberedListElement;
    const children = listElement.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.type !== "list-item") {
        Transforms.wrapNodes(
          editor,
          {
            type: "list-item",
            children: [],
          },
          {
            at: [...path, i],
          },
        );
        return;
      }
    }

    if (children.length === 0) {
      Transforms.removeNodes(editor, {
        at: path,
      });
      return;
    }

    return normalizeNode([node, path]);
  };

  return editor;
};
