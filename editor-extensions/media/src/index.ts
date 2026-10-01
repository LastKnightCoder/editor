import type {} from "./augmentations";
import image from "./extensions/image";
import inlineImage from "./extensions/inline-image";
import imageGallery from "./extensions/image-gallary";
import audio from "./extensions/audio";
import video from "./extensions/video";
import { mediaUiExtension } from "./extensions/media-ui";

export { image, inlineImage, imageGallery, audio, video, mediaUiExtension };
export const mediaExtensions = [
  image,
  inlineImage,
  imageGallery,
  audio,
  video,
  mediaUiExtension,
] as const;
export { createImageExtensions } from "./extensions/image/createImageExtensions";
export { createImageExtension } from "./extensions/image";
export { createImageGalleryExtension } from "./extensions/image-gallary";
export type {
  ImageExtensionOptions,
  ImageAppearanceOption,
  ImageAppearanceSource,
} from "./extensions/image/appearanceOption";
export type { ImageAppearanceConfig } from "./extensions/image/utils/appearance";
export {
  insertImage,
  insertInlineImage,
  insertImageGallery,
  insertVideo,
  insertAudio,
} from "./utils/insertElement";
export * from "./types";
export { openLocalMediaPicker, openMediaUrlInput } from "./utils/mediaInsert";
