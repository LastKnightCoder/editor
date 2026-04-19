import { Descendant } from "slate";
import type { CropperTransform } from "@tau/shared";
import type {
  ImageBorderRadiusPreset,
  ImageShadowPreset,
} from "./image-appearance";

export interface ImageElement {
  type: "image";
  url: string;
  alt?: string;
  uuid?: string;
  pasteUploading?: boolean;

  // 新字段: cropperjs 变换参数
  cropTransform?: CropperTransform;

  // 旧字段: 保留用于向后兼容,但标记为废弃
  /** @deprecated 使用 cropTransform 代替 */
  crop?: any;

  previewUrl?: string;
  width?: number;
  description?: string;
  // 对齐方式：在非浮动时控制图片位置（默认 center）
  align?: "left" | "center" | "right";
  borderRadius?: ImageBorderRadiusPreset;
  shadow?: ImageShadowPreset | boolean;
  children: Descendant[];
}
