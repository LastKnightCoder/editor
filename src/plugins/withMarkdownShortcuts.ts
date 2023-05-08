import { Editor, Element as SlateElement, Node as SlateNode, Range, Transforms } from "slate";
import { HeaderElement, ParagraphElement } from "../custom-types";
import { insertCodeBlock } from "../utils";

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
        }
      }
    }
    insertText(text);
  }
  return editor;
}