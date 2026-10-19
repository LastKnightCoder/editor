import type { Descendant } from "slate";
import type { MarkdownCodec } from "@tau/markdown";

export const frontMatterCodec: MarkdownCodec = {
  type: "front-matter",
  importNode: node =>
    node.type === "yaml"
      ? ({
          type: "front-matter",
          value: node.value,
          children: [{ type: "formatted", text: "" }],
        } as Descendant)
      : null,
  isVoid: true,
  serializer: {
    isBlock: true,
    toMarkdown: element => `---\n${element.value}\n---`,
  },
};
