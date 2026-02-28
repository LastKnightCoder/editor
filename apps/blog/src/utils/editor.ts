import type { InlineElement, FormattedText } from "@tau/editor";

export const getInlineElementText = (
  element: InlineElement | FormattedText,
): string => {
  if (
    (element as { type?: string }).type === "content-link" &&
    "children" in element &&
    Array.isArray(element.children)
  ) {
    const firstChild = element.children[0] as { text?: string } | undefined;
    return firstChild?.text ?? "";
  }

  switch (element.type) {
    case "formatted":
      return element.text;
    case "link":
    case "underline":
    case "styled-text":
      return element.children?.[0]?.text ?? "";
    case "inline-math":
      return element.tex;
    case "html-inline":
      return element.html ?? "";
    case "inline-image":
      return element.alt ?? "[Image]";
    default:
      return "";
  }
};
