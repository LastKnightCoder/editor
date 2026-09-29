import type { MarkdownCodec } from "@tau/markdown";

export const frontMatterCodec: MarkdownCodec = {
  type: "front-matter",
  isVoid: true,
  serializer: {
    isBlock: true,
    toMarkdown: element => `---\n${element.value}\n---`,
  },
};
