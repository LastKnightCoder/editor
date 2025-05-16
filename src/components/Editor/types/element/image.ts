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
  children: Descendant[];
}
