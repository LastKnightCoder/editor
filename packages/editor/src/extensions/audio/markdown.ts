import type { Descendant } from "slate";
import type { MarkdownCodec } from "@tau/markdown";

export const audioCodec: MarkdownCodec = {
  type: "audio",
  isVoid: true,
  directives: {
    audio: attributes => {
      const element = {
        type: "audio",
        src: attributes.src || "",
        uploading: false,
        children: [{ type: "formatted", text: "" }],
      } as Record<string, unknown>;
      if (attributes.isFromGenerate) {
        element.isFromGenerate = attributes.isFromGenerate === "true";
      }
      if (attributes.audioText) element.audioText = attributes.audioText;
      if (attributes.title) element.title = attributes.title;
      return element as unknown as Descendant;
    },
  },
  serializer: {
    isBlock: true,
    toMarkdown: element => {
      const attributes: string[] = [];
      attributes.push(`src="${element.src}"`);
      if (element.title) attributes.push(`title="${element.title}"`);
      if (element.isFromGenerate) attributes.push(`isFromGenerate="${element.isFromGenerate}"`);
      if (element.audioText) attributes.push(`audioText="${element.audioText}"`);
      const attributeStr = attributes.length > 0 ? attributes.join(" ") : "";
      return `:::audio{${attributeStr}}\n:::`;
    },
  },
};
