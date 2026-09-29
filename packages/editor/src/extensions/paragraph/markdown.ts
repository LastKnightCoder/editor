import type { MarkdownCodec } from "@tau/markdown";

export const paragraphCodec: MarkdownCodec = {
  type: "paragraph",
  serializer: {
    isBlock: true,
    toMarkdown: (_element, childrenStr) => childrenStr,
    toMarkdownStructured: (_element, childrenStr) => ({
      output: childrenStr,
      childrenStart: { line: 0, ch: 0 },
    }),
  },
};
