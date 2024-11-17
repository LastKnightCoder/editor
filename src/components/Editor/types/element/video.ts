import { Descendant } from "slate";

export interface VideoElement {
  type: 'video';
  src: string;
  playbackRate?: number;
  uploading?: boolean;
  // width?: number;
  // height?: number;
  children: Descendant[];
}
