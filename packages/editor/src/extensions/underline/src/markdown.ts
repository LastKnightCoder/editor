import type { Descendant } from "slate";
import type { MarkdownCodec } from "@tau/markdown";

/** container（:::underline）与 text（:underline[]）两种写法共用同一个元素形状 */
const underlineElement = (attributes: Record<string, string | undefined>): Descendant =>
  ({
    type: "underline",
    color: attributes.color || "default",
    lineType: attributes.lineType || "solid",
    colorSelectOpen: false,
    children: [],
  }) as Descendant;

export const underlineCodec: MarkdownCodec = {
  type: "underline",
  inlineWrapperDirective: "underline",
  directives: {
    underline: underlineElement,
  },
  serializer: {
    toMarkdown: (element, childrenStr) => {
      const attributes: string[] = [];
      if (element.color) attributes.push(`color=${element.color}`);
      if (element.lineType) attributes.push(`lineType=${element.lineType}`);
      const attributeStr = attributes.length > 0 ? `{${attributes.join(" ")}}` : "";
      return `:underline[${childrenStr}]${attributeStr}`;
    },
    toMarkdownStructured: (element, childrenStr) => {
      const attributes: string[] = [];
      if (element.color) attributes.push(`color=${element.color}`);
      if (element.lineType) attributes.push(`lineType=${element.lineType}`);
      const attributeStr = attributes.length > 0 ? `{${attributes.join(" ")}}` : "";
      return {
        output: `:underline[${childrenStr}]${attributeStr}`,
        childrenStart: { line: 0, ch: ":underline[".length },
      };
    },
  },
};
