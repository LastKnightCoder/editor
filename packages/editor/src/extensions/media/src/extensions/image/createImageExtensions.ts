import { createImageExtension } from "./index";
import type { ImageExtensionOptions } from "./appearanceOption";

/** 宿主定制图片外观：生成 image 扩展，放进宿主扩展列表即可按 type 覆盖内置的同名扩展 */
export function createImageExtensions(options: ImageExtensionOptions) {
  return [createImageExtension(options)];
}
