import type { MarkdownCodec } from "@tau/markdown";

export const linkCodec: MarkdownCodec = {
  type: "link",
  serializer: {
    toMarkdown: (element, childrenStr) => `[${childrenStr}](${element.url})`,
    toMarkdownStructured: (element, childrenStr) => ({
      output: `[${childrenStr}](${element.url})`,
      childrenStart: { line: 0, ch: 1 },
    }),
  },
};
