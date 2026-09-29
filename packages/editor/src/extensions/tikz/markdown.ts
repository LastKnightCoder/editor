import type { MarkdownCodec } from "@tau/markdown";

export const tikzCodec: MarkdownCodec = {
  type: "tikz",
  isVoid: true,
  serializer: {
    isBlock: true,
    toMarkdown: element => "```tikz\n" + `${element.content || ""}` + "\n```",
  },
};
