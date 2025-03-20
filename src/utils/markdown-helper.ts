import { Descendant } from "slate";
import { CustomElement, FormattedText } from "@editor/types";
import { markdownSerializerRegistry } from "./markdownSerializerRegistry";

export const getMarkdown = (value: Descendant[]): string => {
  return value
    .map((element) => {
      const isBlockElement = markdownSerializerRegistry.isBlock(
        element as CustomElement,
      );
      const str = elementToMarkdown(element as CustomElement, null);
      if (str) {
        return isBlockElement ? `${str}\n\n` : str;
      }
      return "";
    })
    .join("")
    .trim()
    .concat("\n");
};

export const leafToMarkdown = (leaf: FormattedText): string => {
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
};

export const elementToMarkdown = (
  element: CustomElement,
  parentElement: CustomElement | null,
): string => {
  const { type, children } = element;
  const childrenStr = children
    .map((node, index) => {
      if (node.type === "formatted") {
        return leafToMarkdown(node);
      } else {
        const isLast = index === children.length - 1;
        // list-item 里面都是块级元素，会自己进行换行
        const isListItem = node.type === "list-item";
        let tail = "";
        if (markdownSerializerRegistry.isBlock(node)) {
          if (isLast || isListItem) {
            tail = "\n";
          } else {
            tail = "\n\n";
          }
        }
        return elementToMarkdown(node, element) + tail;
      }
    })
    .join("");

  const serializer = markdownSerializerRegistry.getSerializer(type);

  return serializer
    ? serializer.toMarkdown(element, childrenStr, parentElement)
    : childrenStr;
};
