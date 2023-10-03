import {Editor, Element as SlateElement, NodeEntry, Path, Transforms} from "slate";
import {isAtFirst} from "@/components/Editor/extensions/utils.ts";
import {FormattedText} from "@/components/Editor/types";

export const markdownSyntax = (editor: Editor) => {
  const { insertText } = editor;

  editor.insertText = (text) => {
    if (isAtFirst(editor, text)) {
      const [node, path] = isAtFirst(editor, text)! as NodeEntry;
      const { text: nodeText } = node as FormattedText;
      const offset = editor.selection!.anchor.offset;
      if (['-', '*', '+'].includes(nodeText.slice(0, offset))) {
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
          },
        });
        Transforms.wrapNodes(editor, {
          type: 'list-item',
          children: []
        });
        // 如果上一个节点是 bulleted-list，则移进去而不是包装
        const [listMatch] = Editor.nodes(editor, {
          match: n => SlateElement.isElement(n) && n.type === 'list-item',
        });
        if (listMatch && listMatch[1][listMatch[1].length - 1] !== 0) {
          const prevPath = Path.previous(listMatch[1]);
          const parent = Editor.parent(editor, listMatch[1]);
          const prevElement = parent[0].children[prevPath[prevPath.length - 1]];
          if (prevElement.type === 'bulleted-list') {
            Transforms.moveNodes(editor, {
              match: n => SlateElement.isElement(n) && n.type === 'list-item',
              to: [...prevPath, prevElement.children.length]
            });
            return;
          }
        }
        Transforms.wrapNodes(editor, {
          type: 'bulleted-list',
          children: []
        }, {
          match: n => SlateElement.isElement(n) && n.type === 'list-item',
        });
        return;
      }
    }
    insertText(text);
  }

  return editor;
}