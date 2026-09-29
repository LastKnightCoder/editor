import type { MarkdownCodec } from "@tau/markdown";

export const plantumlCodec: MarkdownCodec = {
  type: "plantuml",
  isVoid: true,
  fence: { language: "plantuml" },
  serializer: {
    isBlock: true,
    toMarkdown: element => "```plantuml\n" + `${element.content || ""}` + "\n```",
  },
};
