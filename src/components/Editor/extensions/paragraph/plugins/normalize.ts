import {Editor, Transforms} from "slate";

export const normalizeParagraph = (editor: Editor) => {
  const { normalizeNode } = editor;

  editor.normalizeNode = (entry) => {
    // paragraph 里面不能有块级元素，有的话提到 paragraph 的外面
    const [node, path] = entry;
    if (node.type === 'paragraph') {
      const children = node.children;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.type === 'formatted') {
          continue;
        }
        if (editor.isBlock(child)) {
          Transforms.moveNodes(editor, {
            at: [...path, i],
            to: path,
          });
          return;
        }
      }
    }
    normalizeNode(entry);
  };

  return editor;
}

