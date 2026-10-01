import type { MarkdownCodec } from "@tau/markdown";

export const mermaidCodec: MarkdownCodec = {
  type: "mermaid",
  isVoid: true,
  fence: { language: "mermaid", property: "chart" },
  serializer: {
    isBlock: true,
    toMarkdown: element => "```mermaid\n" + `${element.chart || ""}` + "\n```",
  },
};
