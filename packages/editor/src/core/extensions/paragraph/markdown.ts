import type { Descendant } from "slate";
import type { MarkdownCodec } from "@tau/markdown";

export const paragraphCodec: MarkdownCodec = {
  type: "paragraph",
  importNode: node =>
    node.type === "paragraph" ? ({ type: "paragraph", children: [] } as Descendant) : null,
  // 具体子元素如何降级由其 codec 提供，段落只负责应用贡献。
  normalize: (element, context) => {
    element.children = element.children.map(context.demote);
    if (element.children.length === 0) return [];
    return null;
  },
  serializer: {
    isBlock: true,
    toMarkdown: (_element, childrenStr) => childrenStr,
    toMarkdownStructured: (_element, childrenStr) => ({
      output: childrenStr,
      childrenStart: { line: 0, ch: 0 },
    }),
  },
};
