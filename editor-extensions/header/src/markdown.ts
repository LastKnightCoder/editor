import type { Descendant } from "slate";
import type { MarkdownCodec } from "@tau/markdown";

export const headerCodec: MarkdownCodec = {
  type: "header",
  importNode: node =>
    node.type === "heading"
      ? ({ type: "header", level: node.depth, children: [] } as Descendant)
      : null,
  serializer: {
    isBlock: true,
    toMarkdown: (element, childrenStr) => `${"#".repeat(element.level || 1)} ${childrenStr}`,
    toMarkdownStructured: (element, childrenStr) => {
      const prefix = `${"#".repeat(element.level || 1)} `;
      return {
        output: `${prefix}${childrenStr}`,
        childrenStart: { line: 0, ch: prefix.length },
      };
    },
  },
};
