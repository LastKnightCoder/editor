import type { Descendant } from "slate";
import type { MarkdownCodec } from "@tau/markdown";
import type { StyledTextElement } from "../../types/element/styled-text.ts";

const STYLED_TEXT_COLOR_VALUES = ["red", "green", "yellow", "blue", "purple", "gray"] as const;
const STYLED_TEXT_COLOR_SET = new Set<string>(STYLED_TEXT_COLOR_VALUES);

const resolveStyledTextColor = (color: unknown): StyledTextElement["color"] => {
  if (typeof color !== "string") return "red";
  return STYLED_TEXT_COLOR_SET.has(color)
    ? (color as StyledTextElement["color"])
    : ("red" as StyledTextElement["color"]);
};

export const styledTextCodec: MarkdownCodec = {
  type: "styled-text",
  inlineWrapperDirective: "styled-text",
  directives: {
    "styled-text": attributes =>
      ({
        type: "styled-text",
        color: resolveStyledTextColor(attributes.color),
        children: [],
      }) as Descendant,
  },
  serializer: {
    toMarkdown: (element, childrenStr) =>
      `:styled-text[${childrenStr}]{color=${element.color || "red"}}`,
    toMarkdownStructured: (element, childrenStr) => ({
      output: `:styled-text[${childrenStr}]{color=${element.color || "red"}}`,
      childrenStart: { line: 0, ch: ":styled-text[".length },
    }),
  },
};
