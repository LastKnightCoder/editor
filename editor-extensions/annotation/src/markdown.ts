import type { Descendant } from "slate";
import { addExportFootnote, type MarkdownCodec } from "@tau/markdown";

export const annotationCodec: MarkdownCodec = {
  type: "annotation",
  importNode: (node, context) =>
    node.type === "footnoteReference"
      ? ({
          type: "annotation",
          content: context.getFootnote(node.identifier || ""),
          children: [{ type: "formatted", text: "" }],
        } as Descendant)
      : null,
  serializer: {
    toMarkdown: element => `[^${addExportFootnote(element.content || "")}]`,
  },
};
