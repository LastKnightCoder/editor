import { Editor, Element as SlateElement, Node as SlateNode, NodeEntry, Range, Transforms, Path } from "slate";
import { HeaderElement, ParagraphElement } from "../custom-types";
import {getPreviousSibling, insertCodeBlock} from "../utils";

export const withMarkdownShortcuts = (editor: Editor) => {
  const { insertText } = editor;
  editor.insertText = (text) => {
    const { selection } = editor;
    if (text.endsWith(' ') && selection && Range.isCollapsed(selection)) {
      const [match] = Editor.nodes(editor, {
        match: n => SlateElement.isElement(n) && n.type === 'paragraph',
      });
      if (match) {
        const [parentElement] = match;
        const [nodeMatch] = Editor.nodes(editor, {
          match: n => SlateNode.isNode(n) && n.type === 'formatted',
        });
        const [node, path] = nodeMatch;
        // node 是否是 paragraph 的第一个子节点
        const isFirst = (parentElement as ParagraphElement).children[0] === node;
        if (isFirst) {
          const { text: nodeText } = node;
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
            // get language
            const language = nodeText.slice(3);
            insertCodeBlock(editor, language);
            return;
          }
          const levelMatched = nodeText.match(/^#{1,6}/);
          if (levelMatched) {
            const level = levelMatched[0].length as HeaderElement['level'];
            Transforms.delete(editor, {
              at: {
                anchor: {
                  path,
                  offset: 0
                },
                focus: {
                  path,
                  offset: level
                }
              }
            });
            Transforms.setNodes(editor, {
              type: 'header',
              level
            });
            return;
          }
          const offset = selection.anchor.offset;
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
            if (listMatch) {
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
      }
    }
    insertText(text);
  }
  return editor;
}