import type { MarkdownCodec } from "@tau/markdown";

export const blockMathCodec: MarkdownCodec = {
  type: "block-math",
  isVoid: true,
  serializer: {
    isBlock: true,
    toMarkdown: element => `$$\n${element.tex || ""}\n$$`,
  },
};

export const inlineMathCodec: MarkdownCodec = {
  type: "inline-math",
  isVoid: true,
  serializer: {
    toMarkdown: element => `$${element.tex || ""}$`,
  },
};
