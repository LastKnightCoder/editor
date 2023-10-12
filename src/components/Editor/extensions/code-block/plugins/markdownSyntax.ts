import { Editor, Transforms } from "slate";
import { ParagraphElement} from "@/components/Editor/types";
import { insertCodeBlock } from "@/components/Editor/utils";

export const markdownSyntax = (editor: Editor) => {
  const { insertBreak } = editor;

  editor.insertBreak = () => {
    const [para] = Editor.nodes(editor, {
      match: n => n.type === 'paragraph',
      mode: 'lowest'
    });
    if (para) {
      const [node, path] = para;
      const children = (node as ParagraphElement).children;
      if (children.length === 1) {
        const [text] = children;
        if (text.type === 'formatted') {
          const { text: nodeText } = text;
          if (nodeText.startsWith('```')) {
            Transforms.delete(editor, {
              at: {
                anchor: {
                  path: [...path, 0],
                  offset: 0
                },
                focus: {
                  path: [...path, 0],
                  offset: nodeText.length
                }
              }
            });
            const language = nodeText.slice(3).trim();
            insertCodeBlock(editor, language);
            return;
          }
        }
      }
    }

    insertBreak();
  }

  return editor;
}