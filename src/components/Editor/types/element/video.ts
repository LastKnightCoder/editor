import { Descendant } from "slate";

export interface VideoElement {
  type: "video";
  src: string;
  playbackRate?: number;
  uploading?: boolean;
  children: Descendant[];
}
