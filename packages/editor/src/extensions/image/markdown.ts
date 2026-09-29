import type { MarkdownCodec } from "@tau/markdown";

export const imageCodec: MarkdownCodec = {
  type: "image",
  isVoid: true,
  serializer: {
    isBlock: true,
    toMarkdown: element => `![${element.alt || ""}](${element.url})`,
  },
};
