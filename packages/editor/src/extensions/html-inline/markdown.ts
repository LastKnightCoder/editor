import type { MarkdownCodec } from "@tau/markdown";

export const htmlInlineCodec: MarkdownCodec = {
  type: "html-inline",
  serializer: {
    toMarkdown: element => element.html || "",
  },
};
