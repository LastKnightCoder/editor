import { Descendant } from "slate";

export interface BiliBiliVideoMetaInfo {
  type: "bilibili";
  bvid: string;
  cid: string;
  cover?: string;
  title?: string;
  duration?: number;
  author?: string;
}

export interface YouTubeVideoMetaInfo {
  type: "youtube";
  url: string;
  videoStream?: string;
  audioStream?: string;
  title?: string;
  thumbnail?: string;
}

export interface NotionVideoMetaInfo {
  type: "notion";
  blockId: string;
  pageId?: string;
  title?: string;
  cover?: string;
}

export interface LocalVideoMetaInfo {
  type: "local";
  path: string;
  name?: string;
}

export interface RemoteVideoMetaInfo {
  type: "remote";
  url: string;
  contentType?: string;
}

export interface OtherVideoMetaInfo {
  type: "other";
  [key: string]: unknown;
}

export type VideoMetaInfo =
  | BiliBiliVideoMetaInfo
  | YouTubeVideoMetaInfo
  | NotionVideoMetaInfo
  | LocalVideoMetaInfo
  | RemoteVideoMetaInfo
  | OtherVideoMetaInfo;

export interface VideoElement {
  type: "video";
  src: string;
  playbackRate?: number;
  uploading?: boolean;
  width?: number;
  // 对齐方式：控制视频位置（默认 center）
  align?: "left" | "center" | "right";
  metaInfo?: VideoMetaInfo;
  children: Descendant[];
}

export interface BilibiliVideoSelectResult {
  url: string;
  metaInfo: BiliBiliVideoMetaInfo;
}

export interface YoutubeVideoSelectResult {
  url: string;
  videoStream?: string;
  audioStream?: string;
}

export interface NotionVideoSelectResult {
  metaInfo: NotionVideoMetaInfo;
  blockId: string;
}
