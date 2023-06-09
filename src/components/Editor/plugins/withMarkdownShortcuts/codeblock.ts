import {Editor, NodeEntry, Transforms} from "slate";
import {FormattedText} from "../../types";
import {isAtFirst} from "./utils";
import {insertCodeBlock} from "../../utils";

const codeblock = (editor: Editor) => {
  const { insertText } = editor;

  editor.insertText = (text) => {
    if (isAtFirst(editor, text)) {
      const [node, path] = isAtFirst(editor, text)! as NodeEntry;
      const { text: nodeText } = node as FormattedText;
      if (nodeText.startsWith('```')) {
        // 删除 ``` 符号
        Transforms.delete(editor, {
          at: {
            anchor: {
              path,
              offset: 0
            },
            focus: {
              path,
              offset: nodeText.length
            }
          }
        });
        // 获得 language
        const language = nodeText.slice(3);
        insertCodeBlock(editor, language);
        return;
      }
    }
    insertText(text);
  }
  return editor;
}

export default codeblock;
