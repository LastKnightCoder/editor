import {Editor, NodeEntry, Transforms} from "slate";
import {isAtFirst} from "@/pages/Editor/plugins/withMarkdownShortcuts/utils";
import {FormattedText} from "@/pages/Editor/types";

const divideLine = (editor: Editor) => {
  const { insertText } = editor;
  editor.insertText = (text) => {
    if (isAtFirst(editor, text)) {
      const [node, path] = isAtFirst(editor, text)! as NodeEntry;
      const { text: nodeText } = node as FormattedText;
      const offset = editor.selection!.anchor.offset;
      if (nodeText.slice(0, offset) === '---') {
        Transforms.delete(editor, {
          at: {
            anchor: {
              path,
              offset: 0
            },
            focus: {
              path,
              offset
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
    }
    insertText(text);
  }

  return editor;
}

export default divideLine;