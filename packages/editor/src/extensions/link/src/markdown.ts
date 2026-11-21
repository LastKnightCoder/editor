import type { Descendant } from "slate";
import type { MarkdownCodec } from "@tau/markdown";

export const linkCodec: MarkdownCodec = {
  type: "link",
  importNode: node =>
    node.type === "link"
      ? ({ type: "link", url: node.url, children: [] } as unknown as Descendant)
      : null,
  normalize: (element, context) => {
    const children: Descendant[] = element.children;
    element.children = children.map(context.demote).filter(child => !context.isBlock(child));
    return element.children.length ? null : [];
  },
  serializer: {
    toMarkdown: (element, childrenStr) => `[${childrenStr}](${element.url})`,
    toMarkdownStructured: (element, childrenStr) => ({
      output: `[${childrenStr}](${element.url})`,
      childrenStart: { line: 0, ch: 1 },
    }),
  },
};
