import { Editor, NodeEntry, Transforms } from "slate";
import { isAtFirst } from "@/components/Editor/extensions/utils.ts";
import { FormattedText, HeaderElement } from "@/components/Editor/types";

export const markdownSyntax = (editor: Editor) => {
  const { insertText } = editor;

  editor.insertText = (text) => {
    if (isAtFirst(editor, text)) {
      const [node, path] = isAtFirst(editor, text)! as NodeEntry;
      const { text: nodeText } = node as FormattedText;
      const levelMatched = nodeText.match(/^#{1,6}/);
      if (levelMatched) {
        const level = levelMatched[0].length as HeaderElement["level"];
        Editor.withoutNormalizing(editor, () => {
          Transforms.delete(editor, {
            at: {
              anchor: {
                path,
                offset: 0,
              },
              focus: {
                path,
                offset: level,
              },
            },
          });
          Transforms.setNodes(editor, {
            type: "header",
            level,
          });
        });
        return;
      }
    }
    insertText(text);
  };

  return editor;
};
