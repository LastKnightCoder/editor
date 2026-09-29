import type { MarkdownCodec } from "@tau/markdown";

export const imageGalleryCodec: MarkdownCodec = {
  type: "image-gallery",
  serializer: {
    isBlock: true,
    toMarkdown: element =>
      element.images.map((image: { url: string }) => `![](${image.url})`).join("\n"),
  },
};
