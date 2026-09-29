import { addExportFootnote, type MarkdownCodec } from "@tau/markdown";

export const annotationCodec: MarkdownCodec = {
  type: "annotation",
  serializer: {
    toMarkdown: element => `[^${addExportFootnote(element.content || "")}]`,
  },
};
