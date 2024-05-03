import { Element, Text } from 'slate';
import IExtension from "@/components/Editor/extensions/types";

export const elementToMarkdown = (element: Element, parentElement: Element, extensions: IExtension[]): string => {
  const { type, children } = element;
  const childrenStr = children.map(node => {
    if (node.type === 'formatted') {
      return leafToMarkdown(node);
    } else {
      return elementToMarkdown(node, element, extensions);
    }
  }).join('');

  const extension = extensions.find(ext => ext.type === type);
  return extension!.toMarkdown(element, childrenStr, parentElement);
}

export const leafToMarkdown = (leaf: Text): string => {
  const { text, code, highlight, strikethrough, bold, italic } = leaf;
  let str = text;
  if (code) {
    str = `\`${str}\``;
  }
  if (bold) {
    str = `**${str}**`;
  }
  if (italic) {
    str = `*${str}*`;
  }
  if (strikethrough) {
    str = `~~${str}~~`;
  }
  if (highlight) {
    str = `==${str}==`;
  }

  return str;
}