import { Editor } from "slate";
import { hitEmptyOrInlineChild } from "../../utils";

export const withNormalize = (editor: Editor) => {
  const { normalizeNode } = editor;

  editor.normalizeNode = ([node, path]) => {
    if (hitEmptyOrInlineChild(editor, [node, path], "list-item")) {
      return;
    }

    return normalizeNode([node, path]);
  };

  return editor;
};
