import type { Descendant } from "slate";
import type { MarkdownCodec } from "@tau/markdown";

export const blockquoteCodec: MarkdownCodec = {
  type: "blockquote",
  importNode: node =>
    node.type === "blockquote" ? ({ type: "blockquote", children: [] } as Descendant) : null,
  serializer: {
    isBlock: true,
    toMarkdown: (_element, childrenStr) =>
      childrenStr
        .split("\n")
        .map(line => `> ${line}`)
        .join("\n"),
    toMarkdownStructured: (_element, childrenStr) => ({
      output: childrenStr
        .split("\n")
        .map(line => `> ${line}`)
        .join("\n"),
      childrenStart: { line: 0, ch: 2 },
      perLineOffset: 2, // 每行前缀 "> "
    }),
  },
};
