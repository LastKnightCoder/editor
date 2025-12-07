import { Editor, Transforms, Element as SlateElement } from "slate";

export const withNormalize = (editor: Editor) => {
  const { normalizeNode } = editor;

  editor.normalizeNode = (entry) => {
    const [node, path] = entry;

    // 如果是章节元素
    if (
      SlateElement.isElement(node) &&
      (node as any).type === "weread-chapter"
    ) {
      const chapterElement = node as any;

      // 检查 children，移除非 bookmark 类型的子元素
      for (let i = 0; i < chapterElement.children.length; i++) {
        const child = chapterElement.children[i];

        // 如果子元素不是 weread-bookmark 类型，移除它
        if (
          SlateElement.isElement(child) &&
          (child as any).type !== "weread-bookmark"
        ) {
          Transforms.removeNodes(editor, {
            at: [...path, i],
          });
          return;
        }
      }
    }

    // 调用原始的 normalizeNode
    normalizeNode(entry);
  };

  return editor;
};
