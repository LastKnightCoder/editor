import {Editor, NodeEntry, Transforms} from "slate";
import {FormattedText} from "../../types";
import {isAtFirst} from "./utils";

const blockquote = (editor: Editor) => {
  const { insertText } = editor;

  editor.insertText = (text) => {
    if (isAtFirst(editor, text)) {
      const [node, path] = isAtFirst(editor, text)! as NodeEntry;
      const { text: nodeText } = node as FormattedText;
      const offset = editor.selection!.anchor.offset;
      if (nodeText.slice(0, offset) === '>') {
        Transforms.delete(editor, {
          at: {
            anchor: {
              path,
              offset: 0
            },
            focus: {
              path,
              offset: 1
            }
          }
        });
        Transforms.wrapNodes(editor, {
          type: 'blockquote',
          children: []
        });
        return;
      }
    }
    insertText(text);
  }
  return editor;
}

export default blockquote;
