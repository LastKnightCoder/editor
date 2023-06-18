import {Editor, Transforms, Range, Node, Element, NodeMatch, NodeEntry} from "slate";
import {isElementNode, isLeafNode, isParagraphElement, isInlineElementEmpty, isBlockElementEmpty} from "./element";
import { ReactEditor } from "slate-react";
import { ParagraphElement, BlockElement } from "@/pages/Editor/types";

export const getCurrentTextNode = (editor: Editor) => {
  const [match] = Editor.nodes(editor, {
    match: n => isLeafNode(n),
    mode: 'lowest',
  });
  return match;
}

export const getClosestCurrentElement = (editor: Editor): NodeEntry<BlockElement> => {
  const [match] = Editor.nodes(editor, {
    match: n => !Editor.isEditor(n) && isElementNode(n) && Editor.isBlock(editor, n),
    mode: 'lowest',
  });
  return match as NodeEntry<BlockElement>;
}

export const getFarthestCurrentElement = (editor: Editor) => {
  const [match] = Editor.nodes(editor, {
    match: n => isElementNode(n),
    mode: 'highest',
  });
  return match;
}

export const getLeafParent = (editor: Editor) => {
  const [curLeafNode] = Editor.nodes(editor, {
    match: n => isLeafNode(n),
  });
  if (!curLeafNode) {
    return;
  }
  return Editor.parent(editor, curLeafNode[1]);
}

export const getElementParent = (editor: Editor) => {
  const [curEle] = Editor.nodes(editor, {
    match: n => isElementNode(n),
    mode: 'lowest',
  });
  if (!curEle) {
    return;
  }
  return Editor.parent(editor, curEle[1]);
}

export const isAtParagraphStart = (editor: Editor) => {
  const curEle = getClosestCurrentElement(editor);
  if (!curEle) {
    return false;
  }
  const isParagraph = isParagraphElement(curEle[0]);
  if (!isParagraph) {
    return false;
  }
  const { selection } = editor;
  if (!selection || Range.isExpanded(selection)) {
    return false;
  }

  return Editor.isStart(editor, selection.anchor, curEle[1]);
}

export const insertParagraphAndFocus = (editor: Editor, node: Node) => {
  if (!Element.isElement(node)) {
    return;
  }
  const path = ReactEditor.findPath(editor, node);
  const nextPath = [...path.slice(0, path.length - 1), path[path.length - 1] + 1];
  Transforms.insertNodes(editor, {
    type: 'paragraph',
    children: [{ type: 'formatted', text: '' }],
  }, {
    at: nextPath,
    select: true,
  });

  const focus = () => {
    ReactEditor.focus(editor);
    Transforms.select(editor, {
      anchor: {
        path: [...nextPath, 0],
        offset: 0,
      },
      focus: {
        path: [...nextPath, 0],
        offset: 0,
      }
    });
  }

  if (editor.isVoid(node)) {
    setTimeout(() => {
      focus();
    }, 200);
  } else {
    focus();
  }
}

export const replaceNode = (editor: Editor, node: Node, match: NodeMatch<Node>) => {
  const [curEle] = Editor.nodes(editor, {
    match,
    mode: 'lowest',
  });
  if (!curEle) {
    return;
  }
  Transforms.removeNodes(editor, {
    at: curEle[1],
  });
  Transforms.insertNodes(editor, node, {
    at: curEle[1],
  });
}

export const isParagraphAndEmpty = (editor: Editor) => {
  const [match] = Editor.nodes(editor, {
    match: n => n.type === 'paragraph',
  });
  if (!match) {
    return false;
  }
  const [node] = match as NodeEntry<ParagraphElement>;
  return node.children.length === 1 && isInlineElementEmpty(node.children[0]);
}

export const isCollapsed = (editor: Editor) => {
  const { selection } = editor;
  return !selection || Range.isCollapsed(selection);
}

const getCurrentEmptyNodeRecursive = (editor: Editor, emptyNode: NodeEntry<BlockElement>): NodeEntry<BlockElement> => {
  const parent = Editor.parent(editor, emptyNode[1]);
  if (!parent || !isBlockElementEmpty(parent[0] as BlockElement || Editor.isEditor(parent[0]))) {
    return emptyNode;
  }
  return getCurrentEmptyNodeRecursive(editor, parent as NodeEntry<BlockElement>);
}

export const getCurrentEmptyNode = (editor: Editor) => {
  // 首先获取到当前的 block element
  const curNodeEntry = getClosestCurrentElement(editor);
  if (!curNodeEntry) {
    return;
  }
  const [curEle] = curNodeEntry;
  const isEmpty = isBlockElementEmpty(curEle);
  if (!isEmpty) {
    return;
  }
  return getCurrentEmptyNodeRecursive(editor, curNodeEntry);
}

export const focusBlockElement = (editor: Editor, node: Node) => {
  const path = ReactEditor.findPath(editor, node);
  ReactEditor.focus(editor);
  Transforms.select(editor, {
    anchor: {
      path,
      offset: 0,
    },
    focus: {
      path,
      offset: 0,
    }
  });
}

export const removeCurrentEmptyNodeAndFocusPreviousNode = (editor: Editor) => {
  const curEmptyNode = getCurrentEmptyNode(editor);
  if (!curEmptyNode) {
    return;
  }
  const [, curPath] = curEmptyNode;
  Transforms.removeNodes(editor, {
    at: curPath,
  });
  if (curPath[curPath.length - 1] === 0) {
    // 插入段落并聚焦
    Transforms.insertNodes(editor, {
      type: 'paragraph',
      children: [{ type: 'formatted', text: '' }],
    });
    return;
  }
  const prevNode = Editor.previous(editor, {
    at: curEmptyNode[1],
  });
  if (!prevNode) {
    return;
  }
  focusBlockElement(editor, prevNode[0]);
}

