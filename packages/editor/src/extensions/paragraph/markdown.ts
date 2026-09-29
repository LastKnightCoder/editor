import type { Descendant } from "slate";
import type { MarkdownCodec } from "@tau/markdown";

export const paragraphCodec: MarkdownCodec = {
  type: "paragraph",
  importNode: node =>
    node.type === "paragraph" ? ({ type: "paragraph", children: [] } as Descendant) : null,
  // 单图段落提升图片为块级；其余块级子元素（图 / HTML 块）降级为行内形态
  normalize: (element, context) => {
    if (element.children.length === 1 && element.children[0].type === "image") {
      const onlyChild = element.children[0];
      if (Array.isArray(onlyChild.children)) {
        onlyChild.children = [{ type: "formatted", text: "" }];
      }
      return [onlyChild];
    }
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
