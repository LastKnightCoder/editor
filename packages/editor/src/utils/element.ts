import {
  CheckListItemElement,
  InlineElement,
  ListItemElement,
  ParagraphElement,
  BlockElement,
  CustomElement,
  TableElement,
  TableRowElement,
  TableCellElement,
  FormattedText,
} from "../types";
import { Element, isEditor, Node, Editor, Path } from "slate";
import { ReactEditor } from "slate-react";
import { isDeclaredElementEmpty } from "../kit/elementEmpty";

export const isLeafNode = (node: Node) => {
  return !Element.isElement(node) && Node.isNode(node) && !isEditor(node);
};

export const isElementNode = (node: Node): node is CustomElement => {
  return Element.isElement(node);
};

export const isParagraphElement = (node: Node): node is ParagraphElement => {
  return node.type === "paragraph";
};

export const isListItemElement = (node: Node): node is ListItemElement => {
  return node.type === "list-item";
};

export const isCheckListItemElement = (node: Node): node is CheckListItemElement => {
  return node.type === "check-list-item";
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

export const isInlineElementEmpty = (element: InlineElement | FormattedText, editor?: Editor) => {
  if (element.type === "link") {
    return element.children.length === 1 && element.children[0].text === "";
  }
  if (element.type === "inline-math") {
    return element.tex === "";
  }
  if (element.type === "underline") {
    return element.children.length === 1 && element.children[0].text === "";
  }
  if (element.type === "styled-text") {
    return element.children.length === 1 && element.children[0].text === "";
  }
  if (element.type === "kbd") {
    return element.children.length === 1 && element.children[0].text === "";
  }
  if (element.type === "inline-image") {
    return !element.url;
  }
  if ("text" in element) {
    return (element as any).text === "";
  }

  return Element.isElement(element) && isDeclaredElementEmpty(editor, element);
};

export const isTableElementEmpty = (element: TableElement, editor?: Editor) => {
  const { children } = element;
  if (children.length === 0) {
    return true;
  }

  return children.every(child => isTableRowEmpty(child, editor));
};

const isTableRowEmpty = (element: TableRowElement, editor?: Editor) => {
  const { children } = element;
  return children.every(child => isTableCellEmpty(child, editor));
};

const isTableCellEmpty = (element: TableCellElement, editor?: Editor) => {
  const { children } = element;
  return children.every(child => isInlineElementEmpty(child, editor));
};

export const isBlockElementEmpty = (element: BlockElement, editor?: Editor): boolean => {
  switch (element.type) {
    case "paragraph":
      return element.children.every(child => isInlineElementEmpty(child, editor));
    case "list-item":
    case "check-list-item":
    case "blockquote":
    case "callout":
    case "detail":
    case "bulleted-list":
    case "numbered-list":
    case "check-list":
      return element.children.every(child => isBlockElementEmpty(child, editor));
    case "table":
      return isTableElementEmpty(element, editor);
    case "code-block":
      return element.code === "";
    case "block-math":
      return element.tex === "";
    case "image":
      return element.url === "";
    default:
      return isDeclaredElementEmpty(editor, element);
  }
};

export const isInlineElement = (element: Element): element is InlineElement => {
  const { type } = element;

  return (
    type === "inline-math" ||
    type === "link" ||
    type === "underline" ||
    type === "styled-text" ||
    type === "kbd" ||
    type === "inline-image"
  );
};
