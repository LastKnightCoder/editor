import type {} from "@tau/editor/api";
import type { ImageElement } from "./types/element/image";
import type { InlineImageElement } from "./types/element/inline-image";
import type { ImageGalleryElement } from "./types/element/gallery";
import type { AudioElement } from "./types/element/audio";
import type { VideoElement } from "./types/element/video";

declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    image: ImageElement;
    "inline-image": InlineImageElement;
    "image-gallery": ImageGalleryElement;
    audio: AudioElement;
    video: VideoElement;
  }
  interface ExtensionInlineElementMap {
    "inline-image": InlineImageElement;
  }
}
