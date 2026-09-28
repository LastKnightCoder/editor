import type { EGalleryMode } from "../../constants/gallery";
import type { Descendant } from "slate";
import type { ImageBorderRadiusPreset, ImageShadowPreset } from "./image-appearance";

export interface ImageGalleryItem {
  id: string;
  url: string;
  desc?: string;
  width?: number;
  height?: number;
}

export type LastRowMode = "justify" | "nojustify" | "center" | "right" | "hide";

export type ObjectFitMode = "contain" | "cover";

export interface ImageGalleryElement {
  type: "image-gallery";
  mode: EGalleryMode;
  height?: number;
  images: ImageGalleryItem[];
  wider?: boolean;
  columnCount?: number;
  margins?: number;
  lastRow?: LastRowMode;
  objectFit?: ObjectFitMode;
  borderRadius?: ImageBorderRadiusPreset;
  shadow?: ImageShadowPreset | boolean;
  children: Descendant[];
}
