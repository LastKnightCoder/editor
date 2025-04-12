import { Descendant } from "slate";

interface LocalVideoMetaInfo {
  type: "local";
  filePath: string;
}

interface RemoteVideoMetaInfo {
  type: "remote";
  url: string;
}

interface BiliBiliVideoMetaInfo {
  type: "bilibili";
  bvid: string;
  cid: string;
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
