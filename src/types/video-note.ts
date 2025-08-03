import { Descendant } from "slate";

export interface LocalVideoMetaInfo {
  type: "local";
  filePath: string;
}

export interface RemoteVideoMetaInfo {
  type: "remote";
  url: string;
}

export interface BiliBiliVideoMetaInfo {
  type: "bilibili";
  bvid: string;
  cid: string;
  quality?: number; // 用户选择的清晰度，默认使用 80 (1080P)
}

type VideoMetaInfo =
  | LocalVideoMetaInfo
  | RemoteVideoMetaInfo
  | BiliBiliVideoMetaInfo;

export interface VideoNote {
  id: number;
  notes: Array<{
    id: string;
    startTime: number;
    contentId: number;
    content: Descendant[];
    count: number;
  }>;
  createTime: number;
  updateTime: number;
  metaInfo: VideoMetaInfo;
}
