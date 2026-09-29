import type { MarkdownCodec } from "@tau/markdown";

export const bulletedListCodec: MarkdownCodec = {
  type: "bulleted-list",
  serializer: {
    isBlock: true,
    toMarkdown: (_element, childrenStr) => childrenStr,
  },
};
