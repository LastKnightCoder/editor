import { Descendant } from "slate";

export interface ImageElement {
  type: 'image';
  url: string;
  alt?: string;
  pasteUploading?: boolean;
  children: Descendant[];
}