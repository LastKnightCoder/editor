import {Editor, Transforms} from "slate";
import {FormattedText, ParagraphElement} from "@/components/Editor/types";

export const markdownSyntax = (editor: Editor) => {
  const { insertBreak } = editor;
  editor.insertBreak = () => {
    const [paraMatch] = Editor.nodes(editor, {
      match: n => n.type === 'paragraph',
      mode: 'lowest'
    });
    if (!paraMatch) {
      return insertBreak();
    }
    const [para, path] = paraMatch;
    const [text] = (para as ParagraphElement).children;
    if ((para as ParagraphElement).children.length !== 1 || text.type !== 'formatted') {
      return insertBreak();
    }
    const { text: paraText } = text as FormattedText;
    if (paraText === '---') {
      Transforms.delete(editor, {
        at: {
          anchor: {
            path: [...path, 0],
            offset: 0
          },
          focus: {
            path: [...path, 0],
            offset: paraText.length
          }
        }
      });
      Transforms.setNodes(editor, {
        type: 'divide-line',
      });
      Transforms.insertNodes(editor, [{
        type: 'paragraph',
        children: [{
          type: 'formatted',
          text: ''
        }]
      }]);

      return;
    }

    return insertBreak();
  }

  return editor;
}
