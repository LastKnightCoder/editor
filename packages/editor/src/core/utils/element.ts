import { CustomElement } from "../types";
import { Element, isEditor, Node, Editor, Path } from "slate";
import { ReactEditor } from "slate-react";
import { isNodeEmpty } from "../kit/elementEmpty";
export { isParagraphElement } from "../model/paragraph";

export const isLeafNode = (node: Node) => {
  return !Element.isElement(node) && Node.isNode(node) && !isEditor(node);
};

export const isElementNode = (node: Node): node is CustomElement => {
  return Element.isElement(node);
};

export const getParentNodeByNode = (editor: Editor, node: Node) => {
  const path = ReactEditor.findPath(editor, node);
  return Editor.parent(editor, path);
};

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
};

export { isNodeEmpty };
export const isInlineElementEmpty = isNodeEmpty;
export const isBlockElementEmpty = isNodeEmpty;
