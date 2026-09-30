import type { Descendant } from "slate";
import type { ImageCropTransform } from "../../components/ImageCropEditor/geometry";
import type { ImageBorderRadiusPreset, ImageShadowPreset } from "./image-appearance";

/** 旧版 cropperjs 的裁剪参数：保留在存量文档里，不再解读（再次裁剪从原图开始） */
export interface LegacyCropTransform {
  version: "1.0";
  [key: string]: unknown;
}

export interface ImageElement {
  type: "image";
  /** 原图地址（裁剪不改它） */
  url: string;
  alt?: string;
  uuid?: string;
  pasteUploading?: boolean;

  /** 裁剪参数：再次裁剪时据此恢复 */
  cropTransform?: ImageCropTransform | LegacyCropTransform;

  /** @deprecated 使用 cropTransform 代替 */
  crop?: any;

  /** 显示用地址：未裁剪时等于 url，裁剪后为裁剪结果；导出链路同样取它 */
  previewUrl?: string;
  /** 显示图（previewUrl）的像素尺寸，首次加载后写入，用于加载前按比例占位 */
  naturalWidth?: number;
  naturalHeight?: number;
  width?: number;
  description?: string;
  // 对齐方式：在非浮动时控制图片位置（默认 center）
  align?: "left" | "center" | "right";
  borderRadius?: ImageBorderRadiusPreset;
  shadow?: ImageShadowPreset | boolean;
  children: Descendant[];
}
