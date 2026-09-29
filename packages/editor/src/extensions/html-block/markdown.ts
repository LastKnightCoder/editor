import type { MarkdownCodec } from "@tau/markdown";

export const htmlBlockCodec: MarkdownCodec = {
  type: "html-block",
  serializer: {
    isBlock: true,
    toMarkdown: element => element.html || "",
  },
};
