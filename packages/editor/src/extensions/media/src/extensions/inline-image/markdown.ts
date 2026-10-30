import type { MarkdownCodec } from "@tau/markdown";
import { normalizeLocalResourcePath } from "@tau/shared/resource-path";

export const inlineImageCodec: MarkdownCodec = {
  type: "inline-image",
  isVoid: true,
  serializer: {
    isBlock: false,
    toMarkdown: element => `![${element.alt || ""}](${normalizeLocalResourcePath(element.url)})`,
  },
};
