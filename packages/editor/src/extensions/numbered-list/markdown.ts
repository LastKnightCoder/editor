import type { MarkdownCodec } from "@tau/markdown";

export const numberedListCodec: MarkdownCodec = {
  type: "numbered-list",
  serializer: {
    isBlock: true,
    toMarkdown: (_element, childrenStr) => childrenStr,
  },
};
