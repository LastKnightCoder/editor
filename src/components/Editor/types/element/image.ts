import { Descendant } from "slate";
import { Crop } from "react-image-crop";

export interface ImageElement {
  type: "image";
  url: string;
  alt?: string;
  uuid?: string;
  pasteUploading?: boolean;
  crop?: Crop;
  previewUrl?: string;
  width?: number;
  description?: string;
  // 对齐方式：在非浮动时控制图片位置（默认 center）
  align?: "left" | "center" | "right";
  children: Descendant[];
}
