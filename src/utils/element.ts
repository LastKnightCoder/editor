import {ParagraphElement} from "../custom-types";
import {Editor, Element, isEditor, Node} from "slate";

export const isParagraphEmpty = (element: ParagraphElement) => {
  return element.children.length === 1 && element.children[0].text === '';
}

export const isLeafNode = (node: Node) => {
  return !Element.isElement(node) && Node.isNode(node) && !isEditor(node);
}

export const isElementNode = (node: Node) => {
  return Element.isElement(node);
}

export const getCurrentTextNode = (editor: Editor) => {
  const [match] = Editor.nodes(editor, {
    match: n => isLeafNode(n),
    mode: 'lowest',
  });
  if (match) {
    return match[0];
  }
  return null;
}

export const getClosestCurrentElement = (editor: Editor) => {
  const [match] = Editor.nodes(editor, {
    match: n => isElementNode(n),
    mode: 'lowest',
  });
  if (match) {
    return match[0];
  }
  return null;
}

export const getFarthestCurrentElement = (editor: Editor) => {
  const [match] = Editor.nodes(editor, {
    match: n => isElementNode(n),
    mode: 'highest',
  });
  if (match) {
    return match[0];
  }
  return null;
}
