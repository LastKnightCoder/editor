import {Editor, Element as SlateElement, Node as SlateNode, Path, Range, Transforms} from "slate";
import {ParagraphElement} from "@/components/Editor/types";

// 是否在段落的开头按下的空格
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

export const hitDoubleQuit = (editor: Editor, parentType: string) => {
  const [parentMatch] = Editor.nodes(editor, {
    match: n => n.type === parentType,
    mode: 'lowest',
  });

  const [paraMatch] = Editor.nodes(editor, {
    match: n => n.type === 'paragraph',
    mode: 'lowest',
  });

  if (
    !parentMatch ||
    !paraMatch ||
    paraMatch[1].length !== parentMatch[1].length + 1 ||
    paraMatch[1][paraMatch[1].length - 1] !== (parentMatch[0] as any).children.length - 1 ||
    !Editor.isEmpty(editor, paraMatch[0] as any)
  ) {
    return false;
  }

  if (paraMatch[1][paraMatch[1].length - 1] === 0) {
    Transforms.liftNodes(editor, {
      at: paraMatch[1],
    });
    return true;
  }

  // 删除当前段落
  Transforms.delete(editor, {
    at: paraMatch[1],
  });
  // 在 blockMath 下方添加一个新段落
  Transforms.insertNodes(editor, {
    type: 'paragraph',
    children: [{
      type: 'formatted',
      text: '',
    }],
  }, {
    at: Path.next(parentMatch[1]),
    select: true,
  });

  return true;
}