import type { MarkdownCodec } from "@tau/markdown";

export const emojiCodec: MarkdownCodec = {
  type: "emoji",
  serializer: {
    toMarkdown: element => `${element.nativeEmoji || element.emoji}`,
  },
};
