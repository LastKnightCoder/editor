import type { Descendant } from "slate";
import type { MarkdownCodec } from "@tau/markdown";

export const kbdCodec: MarkdownCodec = {
  type: "kbd",
  inlineWrapperDirective: "kbd",
  inlineHtmlWrapper: {
    tag: "kbd",
    create: () => ({ type: "kbd", children: [] }),
  },
  directives: {
    kbd: () =>
      ({
        type: "kbd",
        children: [],
      }) as Descendant,
  },
  serializer: {
    toMarkdown: (_element, childrenStr) => `<kbd>${childrenStr}</kbd>`,
    toMarkdownStructured: (_element, childrenStr) => ({
      output: `<kbd>${childrenStr}</kbd>`,
      childrenStart: { line: 0, ch: 5 },
    }),
  },
};
