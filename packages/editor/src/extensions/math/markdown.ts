import type { Descendant } from "slate";
import type { MarkdownCodec } from "@tau/markdown";

export const blockMathCodec: MarkdownCodec = {
  importNode: node =>
    node.type === "math"
      ? ({
          type: "block-math",
          tex: node.value,
          children: [{ type: "formatted", text: "" }],
        } as Descendant)
      : null,
  type: "block-math",
  isVoid: true,
  serializer: {
    isBlock: true,
    toMarkdown: element => `$$\n${element.tex || ""}\n$$`,
  },
};

export const inlineMathCodec: MarkdownCodec = {
  type: "inline-math",
  importNode: node =>
    node.type === "inlineMath"
      ? ({
          type: "inline-math",
          tex: node.value,
          children: [{ type: "formatted", text: "" }],
        } as Descendant)
      : null,
  isVoid: true,
  serializer: {
    toMarkdown: element => `$${element.tex || ""}$`,
  },
};
