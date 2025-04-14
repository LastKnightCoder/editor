import { Editor, Node, Path, Transforms, Text } from "slate";

export const withNormalize = (editor: Editor) => {
  const { normalizeNode } = editor;

  editor.normalizeNode = (entry) => {
    const zeroWidthChar = "\uFEFF";
    const [node, path] = entry;

    if (node.type === "inline-math") {
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
          { type: "formatted", text: zeroWidthChar },
          { at: nextPath },
        );
      }
      if (isFirstChild || hasPreviousAdjacentInlineVoid) {
        Transforms.insertNodes(
          editor,
          { type: "formatted", text: zeroWidthChar },
          { at: path },
        );
      }
    }

    if (Text.isText(node) && node.type !== "formatted") {
      Transforms.setNodes(editor, { type: "formatted" }, { at: path });
      return;
    }

    normalizeNode(entry);
  };

  return editor;
};
