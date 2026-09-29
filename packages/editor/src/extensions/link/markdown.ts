import type { Descendant } from "slate";
import type { MarkdownCodec } from "@tau/markdown";

export const linkCodec: MarkdownCodec = {
  type: "link",
  importNode: node =>
    node.type === "link" ? ({ type: "link", url: node.url, children: [] } as Descendant) : null,
  // 行内元素里只允许文本子节点，导入后剥掉混入的块级子节点
  normalize: element =>
    element.children.some((child: Descendant) => child.type !== "formatted")
      ? [
          {
            ...element,
            children: element.children.filter((child: Descendant) => child.type === "formatted"),
          },
        ]
      : null,
  serializer: {
    toMarkdown: (element, childrenStr) => `[${childrenStr}](${element.url})`,
    toMarkdownStructured: (element, childrenStr) => ({
      output: `[${childrenStr}](${element.url})`,
      childrenStart: { line: 0, ch: 1 },
    }),
  },
};
