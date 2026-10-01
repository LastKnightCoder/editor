import { Editor, Transforms, Text } from "slate";
import { createParagraph } from "../model/paragraph";

export const withNormalize = (editor: Editor) => {
  const { normalizeNode } = editor;

  editor.normalizeNode = entry => {
    const [node, path] = entry;
    if (Editor.isEditor(node) && node.children.length === 0) {
      Transforms.insertNodes(editor, createParagraph(), { at: [0] });
      return;
    }

    if (Text.isText(node) && node.type !== "formatted") {
      Transforms.setNodes(editor, { type: "formatted" }, { at: path });
      return;
    }

    normalizeNode(entry);
  };

  return editor;
};
