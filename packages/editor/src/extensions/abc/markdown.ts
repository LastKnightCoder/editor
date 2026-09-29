import type { MarkdownCodec } from "@tau/markdown";

export const abcCodec: MarkdownCodec = {
  type: "abc",
  isVoid: true,
  serializer: {
    isBlock: true,
    toMarkdown: element => "```abc\n" + `${element.content || ""}` + "\n```",
  },
};
