import { Editor } from "slate";
import { hitEmptyOrInlineChild } from "@/components/Editor/extensions/utils.ts";

export const withNormalize = (editor: Editor) => {
  const { normalizeNode } = editor;

  editor.normalizeNode = ([node, path]) => {
    if (hitEmptyOrInlineChild(editor, [node, path], 'highlight-block')) {
      return;
    }
    return normalizeNode([node, path]);
  };

  return editor;
}