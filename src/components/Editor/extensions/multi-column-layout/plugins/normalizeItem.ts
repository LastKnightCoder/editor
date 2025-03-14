import { Editor } from "slate";
import { hitEmptyOrInlineChild } from "@/components/Editor/extensions/utils.ts";

export const normalizeItem = (editor: Editor) => {
  const { normalizeNode } = editor;

  editor.normalizeNode = ([node, path]) => {
    if (hitEmptyOrInlineChild(editor, [node, path], "multi-column-item")) {
      return;
    }
    return normalizeNode([node, path]);
  };

  return editor;
};
