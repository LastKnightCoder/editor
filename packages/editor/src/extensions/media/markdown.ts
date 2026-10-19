import { imageCodec } from "./src/extensions/image/markdown.ts";
import { inlineImageCodec } from "./src/extensions/inline-image/markdown.ts";
import { imageGalleryCodec } from "./src/extensions/image-gallary/markdown.ts";
import { videoCodec } from "./src/extensions/video/markdown.ts";
import { audioCodec } from "./src/extensions/audio/markdown.ts";
export const mediaMarkdownCodecs = [
  imageCodec,
  inlineImageCodec,
  imageGalleryCodec,
  videoCodec,
  audioCodec,
];
