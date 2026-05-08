import { Descendant } from "slate";
import type { CustomElement, FormattedText } from "@tau/editor/src";
import { markdownSerializerRegistry } from "./markdownSerializerRegistry";

// eslint-disable-next-line no-misleading-character-class
const ZERO_WIDTH_TRAILING_REGEX = /[\u200B\u200C\u200D\uFEFF]$/;

const endsWithZeroWidth = (text: string): boolean => {
  return ZERO_WIDTH_TRAILING_REGEX.test(text);
};

export const getMarkdown = (value: Descendant[]): string => {
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

  const footnoteDefinitions =
    markdownSerializerRegistry.getFootnoteDefinitions();
  return content + footnoteDefinitions;
};

export const leafToMarkdown = (
  leaf: FormattedText,
  options?: { suppressLeadingZeroWidth?: boolean },
): string => {
  const {
    text,
    code,
    highlight,
    strikethrough,
    bold,
    italic,
    color,
    darkColor,
    textGradient,
  } = leaf;
  let str = text;
  if (code) {
    str = `\`${str}\``;
  }
  if (italic) {
    str = `*${str}*`;
  }
  if (strikethrough) {
    str = `~~${str}~~`;
  }
  if (bold) {
    const prefix = options?.suppressLeadingZeroWidth ? "" : "​";
    str = `${prefix}**${str}**`;
  }
  if (textGradient) {
    str = `:gradient[${str}]{preset=${textGradient}}`;
  } else if (color && darkColor) {
    str = `:color[${str}]{color=${color} darkColor=${darkColor}}`;
  }
  if (highlight && typeof highlight === "string") {
    str = `:highlight[${str}]{color=${highlight}}`;
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

  const childrenParts: string[] = [];

  children.forEach((node, index) => {
    if (node.type === "formatted") {
      const prevOutput =
        childrenParts.length > 0 ? childrenParts[childrenParts.length - 1] : "";
      const suppressLeadingZeroWidth = endsWithZeroWidth(prevOutput);
      childrenParts.push(leafToMarkdown(node, { suppressLeadingZeroWidth }));
      return;
    }

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
    childrenParts.push(elementToMarkdown(node, element) + tail);
  });

  const childrenStr = childrenParts.join("");

  const serializer = markdownSerializerRegistry.getSerializer(type);

  return serializer
    ? serializer.toMarkdown(element, childrenStr, parentElement)
    : childrenStr;
};
