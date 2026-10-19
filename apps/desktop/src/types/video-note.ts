import type { OnlineVideoMetaInfo } from "./online-video";

export interface LocalVideoMetaInfo {
  type: "local";
  filePath: string;
}

export interface RemoteVideoMetaInfo {
  type: "remote";
  url: string;
}

/** 本地、远程之外的 type 为在线视频提供方插件 ID，见 OnlineVideoMetaInfo。 */
export type VideoMetaInfo = LocalVideoMetaInfo | RemoteVideoMetaInfo | OnlineVideoMetaInfo;

export const isLocalVideoMeta = (meta: VideoMetaInfo): meta is LocalVideoMetaInfo =>
  meta.type === "local";
export const isRemoteVideoMeta = (meta: VideoMetaInfo): meta is RemoteVideoMetaInfo =>
  meta.type === "remote";

export interface TranscriptSegment {
  text: string;
  start: number; // milliseconds
  end: number; // milliseconds
}

export interface VideoNoteHighlight {
  id: string;
  title: string;
  quote: string;
  start: number; // milliseconds
  end: number; // milliseconds
  topicId?: string;
  startSegmentIdx?: number;
  endSegmentIdx?: number;
  startCharOffset?: number;
  endCharOffset?: number;
  confidence?: number;
}

export type VideoNoteTopicSource = "auto" | "custom";

export interface VideoNoteTopic {
  id: string;
  name: string;
  summary?: string;
  source: VideoNoteTopicSource;
}

export interface VideoNoteInsights {
  version: number;
  transcriptHash: string;
  generatedAt: number;
  topics: VideoNoteTopic[];
  highlights: VideoNoteHighlight[];
  modelMeta?: {
    providerId?: string;
    providerName?: string;
    modelName?: string;
  };
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
  summary?: string; // 视频总结（Markdown 格式）
  highlights?: VideoNoteHighlight[]; // AI 高亮片段
  insights?: VideoNoteInsights;
}
