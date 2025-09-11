import { Descendant } from "slate";
import { CustomElement, FormattedText } from "@editor/types";
import { markdownSerializerRegistry } from "./markdownSerializerRegistry";

export const getMarkdown = (value: Descendant[]): string => {
  // 重置脚注状态
  markdownSerializerRegistry.resetFootnotes();

  const content = value
    .map((element, index) => {
      const isBlockElement = markdownSerializerRegistry.isBlock(
        element as CustomElement,
      );
      const str = elementToMarkdown(element as CustomElement, null);
      const isLast = index === value.length - 1;
      if (str) {
        return isBlockElement ? `${str}${isLast ? "\n" : "\n\n"}` : str;
      }
      return "";
    })
    .join("");

  // 添加脚注定义
  const footnoteDefinitions =
    markdownSerializerRegistry.getFootnoteDefinitions();
  return content + footnoteDefinitions;
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
  const isList =
    type === "bulleted-list" ||
    type === "numbered-list" ||
    type === "check-list";

  const childrenStr = children
    .map((node, index) => {
      if (node.type === "formatted") {
        return leafToMarkdown(node);
      } else {
        const isLast = index === children.length - 1;

        let tail = "";
        if (markdownSerializerRegistry.isBlock(node)) {
          if (isLast) {
            tail = "";
          } else if (isList) {
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
