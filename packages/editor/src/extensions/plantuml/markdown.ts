import type { MarkdownCodec } from "@tau/markdown";

export const plantumlCodec: MarkdownCodec = {
  type: "plantuml",
  isVoid: true,
  serializer: {
    isBlock: true,
    toMarkdown: element => "```plantuml\n" + `${element.content || ""}` + "\n```",
  },
};
