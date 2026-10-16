import type { EditorMarkdownCodec as MarkdownCodec } from "@tau/plugins";

export const customBlockCodec: MarkdownCodec = {
  type: "custom-block",
  fence: { language: "custom-block" },
  serializer: {
    isBlock: true,
    toMarkdown: element => "```custom-block\n" + `${element.content}` + "\n```",
  },
};
