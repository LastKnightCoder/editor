import { EGalleryMode } from "../../constants";
import { Descendant } from "slate";

export interface ImageGalleryItem {
  id: string;
  url: string;
  desc?: string;
}

export interface ImageGalleryElement {
  type: "image-gallery";
  mode: EGalleryMode;
  height?: number;
  images: ImageGalleryItem[];
  wider?: boolean;
  columnCount?: number;
  children: Descendant[];
}
