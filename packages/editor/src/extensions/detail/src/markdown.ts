import type { Descendant } from "slate";
import type { MarkdownCodec } from "@tau/markdown";

export const detailCodec: MarkdownCodec = {
  type: "detail",
  directives: {
    detail: attributes =>
      ({
        type: "detail",
        title: attributes.title || "DETAIL",
        open: attributes.open === "true",
        children: [],
      }) as Descendant,
  },
  serializer: {
    isBlock: true,
    toMarkdown: (element, childrenStr) => {
      const attributes: string[] = [];
      if (element.title) {
        attributes.push(`title="${element.title}"`);
      }
      if (element.open) {
        attributes.push(`open=true`);
      }
      const attributeStr = attributes.length > 0 ? attributes.join(" ") : "";
      return `:::detail{${attributeStr}}\n${childrenStr}\n:::`;
    },
    toMarkdownStructured: (element, childrenStr) => {
      const attributes: string[] = [];
      if (element.title) {
        attributes.push(`title="${element.title}"`);
      }
      if (element.open) {
        attributes.push(`open=true`);
      }
      const attributeStr = attributes.length > 0 ? attributes.join(" ") : "";
      return {
        output: `:::detail{${attributeStr}}\n${childrenStr}\n:::`,
        childrenStart: { line: 1, ch: 0 },
      };
    },
  },
};
