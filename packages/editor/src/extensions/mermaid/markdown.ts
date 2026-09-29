import type { MarkdownCodec } from "@tau/markdown";

export const mermaidCodec: MarkdownCodec = {
  type: "mermaid",
  isVoid: true,
  serializer: {
    isBlock: true,
    toMarkdown: element => "```mermaid\n" + `${element.chart || ""}` + "\n```",
  },
};
