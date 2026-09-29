import type { Descendant } from "slate";
import type { MarkdownCodec } from "@tau/markdown";
import type { HighlightBlockElement } from "../../types/element/highlight-block.ts";

export const highlightBlockCodec: MarkdownCodec = {
  type: "highlight-block",
  directives: {
    "highlight-block": attributes =>
      ({
        type: "highlight-block",
        color: (attributes.color || "red") as HighlightBlockElement["color"],
        children: [],
      }) as Descendant,
  },
  serializer: {
    isBlock: true,
    toMarkdown: (element, childrenStr) =>
      `:::highlight-block{color=${element.color || "default"}}\n${childrenStr}\n:::`,
    toMarkdownStructured: (element, childrenStr) => ({
      output: `:::highlight-block{color=${element.color || "default"}}\n${childrenStr}\n:::`,
      childrenStart: { line: 1, ch: 0 },
    }),
  },
};
