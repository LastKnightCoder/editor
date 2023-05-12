import { Editor, Transforms, Range } from "slate";
import { v4 as getUuid } from 'uuid';
import {isElementNode, isLeafNode, isParagraphElement} from "./element";
import { ReactEditor } from "slate-react";

export const insertCodeBlock = (editor: Editor, language = 'javascript') => {
  const uuid = getUuid();
  Transforms.setNodes(editor, { type: 'code-block', code: '', language: language, uuid, children: [{ type: 'formatted', text: '' }] });
  // 聚焦到 code-block
  setTimeout(() => {
    const codeMirrorEditor = editor.codeBlockMap.get(uuid);
    if (codeMirrorEditor) {
      ReactEditor.blur(editor);
      codeMirrorEditor.focus();
    }
  }, 0);
}

export const getCurrentTextNode = (editor: Editor) => {
  const [match] = Editor.nodes(editor, {
    match: n => isLeafNode(n),
    mode: 'lowest',
  });
  return match;
}

export const getClosestCurrentElement = (editor: Editor) => {
  const [match] = Editor.nodes(editor, {
    match: n => isElementNode(n),
    mode: 'lowest',
  });
  return match;
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