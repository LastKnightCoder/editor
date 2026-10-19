import type { MarkdownCodec } from "@tau/markdown";

export const inlineImageCodec: MarkdownCodec = {
  type: "inline-image",
  isVoid: true,
  serializer: {
    isBlock: false,
    toMarkdown: element => `![${element.alt || ""}](${element.url})`,
  },
};
