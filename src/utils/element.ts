import {ListItemElement, ParagraphElement} from "../custom-types";
import { Element, isEditor, Node, Editor } from "slate";
import {ReactEditor} from "slate-react";
import {getPrevPath} from "./path";

export const isParagraphEmpty = (element: ParagraphElement) => {
  return element.children.length === 1 && element.children[0].text === '';
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

export const getParentNodeByNode = (node: Node, editor: Editor) => {
  const path = ReactEditor.findPath(editor, node);
  return Editor.parent(editor, path);
}

export const getPreviousSibling = (node: Node, editor: Editor) => {
  const path = ReactEditor.findPath(editor, node);
  const parent = Editor.parent(editor, path);
  const index = path[path.length - 1];
  if (index === 0) {
    return undefined;
  }
  return [parent[0].children[index - 1], [...path.slice(0, path.length - 1), index - 1]];
}