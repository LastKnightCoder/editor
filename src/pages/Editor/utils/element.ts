import {
  CheckListItemElement,
  FormattedText,
  InlineMathElement,
  ListItemElement,
  ParagraphElement
} from "../custom-types";
import {Element, isEditor, Node, Editor, Path} from "slate";
import {ReactEditor} from "slate-react";

export const isParagraphEmpty = (element: ParagraphElement) => {
  return element.children.length === 1 && ((element.children[0] as FormattedText).text === '' || (element.children[0] as InlineMathElement).tex === '');
}

export const isLeafNode = (node: Node) => {
  return !Element.isElement(node) && Node.isNode(node) && !isEditor(node);
}

export const isElementNode = (node: Node) => {
  return Element.isElement(node);
}

export const isParagraphElement = (node: Node): node is ParagraphElement => {
  return node.type === 'paragraph';
}

export const isListItemElement = (node: Node): node is ListItemElement => {
  return node.type === 'list-item';
}

export const isCheckListItemElement = (node: Node): node is CheckListItemElement => {
  return node.type === 'check-list-item';
}

export const getParentNodeByNode = (editor: Editor, node: Node) => {
  const path = ReactEditor.findPath(editor, node);
  return Editor.parent(editor, path);
}

export const getPreviousSiblingNode = (editor: Editor, node: Node) => {
  const path = ReactEditor.findPath(editor, node);
  if (!path || Editor.isEditor(node)) {
    return null;
  }
  if (path[path.length - 1] === 0) {
    return null;
  }
  const preSiblingPath = Path.previous(path);
  return Editor.node(editor, preSiblingPath);
}