import { Editor, Transforms } from "slate";

export const withNormalizeBlockquote = (editor: Editor) => {
  const { normalizeNode } = editor;

  editor.normalizeNode = ([node, path]) => {
    if (node.type !== 'blockquote') {
      return normalizeNode([node, path]);
    }
    // blockquote 为空时，删除 blockquote
    // 或者只有一个元素，但是是 inline 元素，删除 blockquote
    if (node.children.length === 0 || (node.children.length === 1 && node.children[0].type === 'formatted' )) {
      Transforms.removeNodes(editor, {
        at: path,
      });
      return;
    }
  };

  return editor;
}

