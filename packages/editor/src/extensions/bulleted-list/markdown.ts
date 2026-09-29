import type { Descendant } from "slate";
import type { MarkdownCodec } from "@tau/markdown";

export const bulletedListCodec: MarkdownCodec = {
  type: "bulleted-list",
  childSeparator: "\n",
  importNode: node =>
    node.type === "list" && !node.ordered
      ? ({ type: "bulleted-list", children: [] } as Descendant)
      : null,
  serializer: {
    isBlock: true,
    toMarkdown: (_element, childrenStr) => childrenStr,
  },
};
