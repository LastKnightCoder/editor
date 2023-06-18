import {Editor, Element as SlateElement, Node as SlateNode, Range} from "slate";
import {ParagraphElement} from "../../types";

export const isAtFirst = (editor: Editor, text: string) => {
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
      if (!nodeMatch) {
        return;
      }
      const [node, path] = nodeMatch;
      // node 是否是 paragraph 的第一个子节点
      const isFirst = (parentElement as ParagraphElement).children[0] === node;
      if (isFirst) {
        return [node, path]
      }
    }
  }
  return;
}