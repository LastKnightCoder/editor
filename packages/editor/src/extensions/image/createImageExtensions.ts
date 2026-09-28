import ImageExtension from "./index";
import ImageGalleryExtension from "../image-gallary";
import type { ImageExtensionOptions } from "./appearanceOption";

/**
 * 宿主定制图片外观：同时生成 image 与 image-gallery 两个扩展，放进宿主扩展列表即可
 * 按 type 覆盖内置的同名扩展。
 */
export function createImageExtensions(options: ImageExtensionOptions) {
  return [new ImageExtension(options), new ImageGalleryExtension(options)];
}
