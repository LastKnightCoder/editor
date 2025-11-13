import { Descendant } from "slate";
import type {
  BiliBiliVideoMetaInfo,
  YouTubeVideoMetaInfo,
  NotionVideoMetaInfo,
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
    | YouTubeVideoMetaInfo
    | NotionVideoMetaInfo;
  width?: number;
  // 对齐方式：控制视频位置（默认 center）
  align?: "left" | "center" | "right";
  children: Descendant[];
}
