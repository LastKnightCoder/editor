import type { Descendant } from "slate";
import type { MarkdownCodec } from "@tau/markdown";

export const numberedListCodec: MarkdownCodec = {
  type: "numbered-list",
  childSeparator: "\n",
  importNode: node =>
    node.type === "list" && node.ordered
      ? ({ type: "numbered-list", children: [] } as Descendant)
      : null,
  serializer: {
    isBlock: true,
    toMarkdown: (_element, childrenStr) => childrenStr,
  },
};
