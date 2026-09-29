import type { MarkdownCodec } from "@tau/markdown";

export const typstCodec: MarkdownCodec = {
  type: "typst",
  isVoid: true,
  fence: { language: "typst" },
  serializer: {
    isBlock: true,
    toMarkdown: element => "```typst\n" + `${element.content || ""}` + "\n```",
  },
};
