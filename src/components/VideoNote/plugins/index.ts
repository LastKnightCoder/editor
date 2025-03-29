import { Editor, Path, Node, Transforms, Text } from "slate";

export const createInlineElementPlugin = (type: string) => {
  return (editor: Editor) => {
    const { isInline } = editor;

    editor.isInline = (element) => {
      return element.type === type ? true : isInline(element);
    };

    return editor;
  };
};

export const createVoidElementPlugin = (type: string) => {
  return (editor: Editor) => {
    const { isVoid } = editor;

    editor.isVoid = (element) => {
      return element.type === type ? true : isVoid(element);
    };

    return editor;
  };
};

export const createInlineNormalizePlugin = (type: string) => {
  return (editor: Editor) => {
    const { normalizeNode } = editor;

    editor.normalizeNode = (entry) => {
      const zeroWidthChar = "\uFEFF";
      const [node, path] = entry;

      if (node.type === type) {
        const parentNode = Node.parent(editor, path);
        const isFirstChild = !Path.hasPrevious(path);
        const isLastChild =
          path[path.length - 1] === parentNode.children.length - 1;

        const nextPath = Path.next(path);

        let hasPreviousAdjacentInlineVoid = false;
        if (!isFirstChild) {
          const prevSibling = Node.get(editor, Path.previous(path));
          hasPreviousAdjacentInlineVoid = prevSibling.type === type;
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
};
