import type { Descendant } from "slate";
import type { MarkdownCodec } from "@tau/markdown";

export const htmlInlineCodec: MarkdownCodec = {
  type: "html-inline",
  importNode: node =>
    node.type === "html" && node.htmlType === "inline"
      ? ({
          type: "html-inline",
          html: node.value,
          openEdit: false,
          children: [{ type: "formatted", text: "" }],
        } as Descendant)
      : null,
  serializer: {
    toMarkdown: element => element.html || "",
  },
};
