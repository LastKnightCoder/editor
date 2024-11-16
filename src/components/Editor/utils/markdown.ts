import { Editor, Element, Text } from 'slate';
import IExtension from "@/components/Editor/extensions/types";

export const elementToMarkdown = (editor: Editor, element: Element, parentElement: Element, extensions: IExtension[]): string => {
  const { type, children } = element;
  const childrenStr = children.map((node, index) => {
    if (node.type === 'formatted') {
      return leafToMarkdown(node);
    } else {
      const isLast = index === children.length - 1;
      // list-item 里面都是块级元素，会自己进行换行
      const isListItem = node.type === 'list-item';
      let tail = '';
      if (editor.isBlock(node)) {
        if (isLast || isListItem) {
          tail = '\n';
        } else {
          tail = '\n\n';
        }
      }
      return elementToMarkdown(editor, node, element, extensions) + tail;
    }
  }).join('');

  const extension = extensions.find(ext => ext.type === type);
  return extension?.toMarkdown(element, childrenStr, parentElement) || childrenStr;
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
