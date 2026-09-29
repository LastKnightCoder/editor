import type { MarkdownCodec } from "@tau/markdown";

export const customBlockCodec: MarkdownCodec = {
  type: "custom-block",
  serializer: {
    isBlock: true,
    toMarkdown: element => "```custom-block\n" + `${element.content}` + "\n```",
  },
};
