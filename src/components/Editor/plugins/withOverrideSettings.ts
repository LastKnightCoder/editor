import { Editor, Node, Path, Transforms, Text } from "slate";

export const withOverrideSettings = (editor: Editor) => {
  const { isBlock, isVoid, isInline, normalizeNode } = editor;
  editor.isBlock = (element) => {
    const blockTypes: string[] = [
      'paragraph',
      'header',
      'callout',
      'bulleted-list',
      'numbered-list',
      'code-block',
      'image',
      'detail',
      'blockquote',
      'table',
      'table-row',
      'table-cell',
      'block-math',
      'mermaid',
      'tikz',
      'html-block',
      'graphviz',
      'custom-block',
      'divide-line',
      'image-gallery',
    ];
    return blockTypes.includes(element.type) ? true : isBlock(element);
  }
  editor.isVoid = (element) => {
    const voidTypes = [
      'code-block',
      'image',
      'inline-math',
      'block-math',
      'mermaid',
      'tikz',
      'html-block',
      'graphviz',
      'custom-block',
      'divide-line',
      'image-gallery',
    ];
    return voidTypes.includes(element.type) ? true : isVoid(element);
  }
  editor.isInline = (element) => {
    const inlineTypes = ['link', 'inline-math', 'underline', 'styled-text'];
    return inlineTypes.includes(element.type) ? true : isInline(element);
  }

  editor.normalizeNode = (entry) => {
    const zeroWidthChar = "\uFEFF";
    const [node, path] = entry;

    if (node.type === 'inline-math') {
      const parentNode = Node.parent(editor, path);
      const isFirstChild = !Path.hasPrevious(path);
      const isLastChild =
        path[path.length - 1] === parentNode.children.length - 1;

      // If the inlineVoid is at the end of a line, must get path after the inlineVoid
      // at which to insert a zero width character
      const nextPath = Path.next(path);

      let hasPreviousAdjacentInlineVoid = false;
      if (!isFirstChild) {
        const prevSibling = Node.get(editor, Path.previous(path));
        hasPreviousAdjacentInlineVoid = prevSibling.type === "inline-math";
      }

      if (isLastChild) {
        Transforms.insertNodes(
          editor,
          { type: 'formatted', text: zeroWidthChar },
          { at: nextPath }
        );
      }
      if (isFirstChild || hasPreviousAdjacentInlineVoid) {
        Transforms.insertNodes(editor, { type: 'formatted', text: zeroWidthChar }, { at: path });
      }
    }

    if (Text.isText(node) && node.type !== 'formatted') {
      Transforms.setNodes(editor, { type: 'formatted' }, { at: path });
      return;
    }

    normalizeNode(entry);
  };

  return editor;
}