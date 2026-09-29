import type { MarkdownCodec } from "@tau/markdown";

export const headerCodec: MarkdownCodec = {
  type: "header",
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
