import { Editor, Element as SlateElement, NodeEntry, Transforms } from "slate";
import { isAtFirst } from "@/components/Editor/extensions/utils.ts";
import { FormattedText } from "@/components/Editor/types";

export const markdownSyntax = (editor: Editor) => {
  const { insertText } = editor;

  editor.insertText = (text) => {
    if (isAtFirst(editor, text)) {
      const [node, path] = isAtFirst(editor, text)! as NodeEntry;
      const { text: nodeText } = node as FormattedText;
      const offset = editor.selection!.anchor.offset;
      if (/^\d+\.$/.exec(nodeText.slice(0, offset))) {
        Editor.withoutNormalizing(editor, () => {
          Transforms.delete(editor, {
            at: {
              anchor: {
                path,
                offset: 0,
              },
              focus: {
                path,
                offset,
              },
            },
          });
          Transforms.wrapNodes(editor, {
            type: "list-item",
            children: [],
          });
          Transforms.wrapNodes(
            editor,
            {
              type: "numbered-list",
              children: [],
            },
            {
              match: (n) => SlateElement.isElement(n) && n.type === "list-item",
            },
          );
        });
        return;
      }
    }
    insertText(text);
  };

  return editor;
};
