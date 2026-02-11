import { Editor, Element, Transforms } from "slate";
import type { ParagraphElement } from "@tau/editor/src";
import type { ContentLinkElement } from "../types";

export const normalize = (editor: Editor) => {
  const { normalizeNode } = editor;

  editor.normalizeNode = ([node, path]) => {
    if (!Element.isElement(node) || node.type !== "content-link") {
      return normalizeNode([node, path]);
    }

    // 如果 content-link 不是在 paragraph 里面，就把它包裹在 paragraph 里面
    const parentPath = path.slice(0, path.length - 1);
    const parentNode = Editor.node(editor, parentPath);
    if (
      path.length === 0 ||
      (parentNode && parentNode[0].type !== "paragraph")
    ) {
      const contentLinkNode = node as ContentLinkElement;
      const paragraphNode: ParagraphElement = {
        type: "paragraph",
        children: [contentLinkNode],
      };
      // 将 content-link 包裹在 paragraph 里面
      Transforms.wrapNodes(editor, paragraphNode, {
        at: path,
      });

      return;
    }

    return normalizeNode([node, path]);
  };

  return editor;
};
