import { Descendant } from "slate";
import type {
  BiliBiliVideoMetaInfo,
  YouTubeVideoMetaInfo,
  LocalVideoMetaInfo,
  RemoteVideoMetaInfo,
} from "@/types";

export interface VideoElement {
  type: "video";
  src: string;
  playbackRate?: number;
  uploading?: boolean;
  metaInfo?:
    | LocalVideoMetaInfo
    | RemoteVideoMetaInfo
    | BiliBiliVideoMetaInfo
    | YouTubeVideoMetaInfo;
  children: Descendant[];
}
