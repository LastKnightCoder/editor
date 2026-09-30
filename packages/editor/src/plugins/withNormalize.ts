import { Editor, Transforms, Text } from "slate";
import { isRetiredEditorBlock } from "@tau/db-schema";

export const withNormalize = (editor: Editor) => {
  const { normalizeNode } = editor;

  editor.normalizeNode = entry => {
    const [node, path] = entry;
    if (Editor.isEditor(node) && node.children.length === 0) {
      Transforms.insertNodes(
        editor,
        { type: "paragraph", children: [{ type: "formatted", text: "" }] },
        { at: [0] }
      );
      return;
    }
    if (path.length && isRetiredEditorBlock(node)) {
      Transforms.removeNodes(editor, { at: path });
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
