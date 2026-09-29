import type { MarkdownCodec } from "@tau/markdown";

export const divideLineCodec: MarkdownCodec = {
  type: "divide-line",
  isVoid: true,
  serializer: {
    isBlock: true,
    toMarkdown: () => "---",
  },
};
