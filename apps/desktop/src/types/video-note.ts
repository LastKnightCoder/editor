import type { StreamOption } from "./youtube";

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

export interface YouTubeVideoMetaInfo {
  type: "youtube";
  url: string;
  videoStream: StreamOption;
  audioStream: StreamOption;
}

export interface NotionVideoMetaInfo {
  type: "notion";
  blockId: string;
  cache?: boolean; // 是否缓存视频，默认 true
}

export type VideoMetaInfo =
  | LocalVideoMetaInfo
  | RemoteVideoMetaInfo
  | BiliBiliVideoMetaInfo
  | YouTubeVideoMetaInfo
  | NotionVideoMetaInfo;

export interface TranscriptSegment {
  text: string;
  start: number; // milliseconds
  end: number; // milliseconds
}

export interface VideoNote {
  id: number;
  createTime: number;
  updateTime: number;
  metaInfo: VideoMetaInfo;
  description?: string;
  transcript?: string;
  transcriptSegments?: TranscriptSegment[];
  transcriptWordSegments?: TranscriptSegment[]; // 原始词级时间戳，用于 AI 重新优化
}
