import { EGalleryMode } from "../../constants";
import { Descendant } from "slate";

export interface ImageGalleryItem {
  id: string;
  url: string;
  desc?: string;
  width?: number;
  height?: number;
}

export type LastRowMode = 'justify' | 'nojustify' | 'center' | 'right' | 'hide';

export type ObjectFitMode = 'contain' | 'cover';

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
  children: Descendant[];
}
