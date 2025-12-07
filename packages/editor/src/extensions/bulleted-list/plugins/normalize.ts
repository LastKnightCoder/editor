import { Editor, Transforms } from "slate";
import { mergeConsecutiveLists } from "../../../utils";
import type { BulletedListElement } from "../../../types";

export const withNormalize = (editor: Editor) => {
  const { normalizeNode } = editor;

  editor.normalizeNode = ([node, path]) => {
    if (node.type !== "bulleted-list") {
      return normalizeNode([node, path]);
    }
    const listElement = node as BulletedListElement;

    // 首先尝试合并连续的相同类型列表
    if (mergeConsecutiveLists(editor, listElement, path)) {
      return;
    }

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
