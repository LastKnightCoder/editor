import type { MarkdownCodec } from "@tau/markdown";

export const webviewCodec: MarkdownCodec = {
  type: "webview",
  isVoid: true,
  serializer: {
    isBlock: true,
    toMarkdown: element =>
      `<iframe src="${element.url}" width="100%" height="${element.height}" frameborder="0"></iframe>`,
  },
};
