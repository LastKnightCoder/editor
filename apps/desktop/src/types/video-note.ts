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

/** AI 章节：起点毫秒 + 标题 + 一句摘要 */
export interface VideoNoteChapter {
  start: number;
  title: string;
  summary: string;
}

/** 存于 video_notes.insights；transcriptHash 对不上当前转录即视为过期、自动重新生成 */
export interface VideoNoteInsights {
  version: 2;
  transcriptHash: string;
  generatedAt: number;
  chapters: VideoNoteChapter[];
}

export const isVideoNoteInsights = (value: unknown): value is VideoNoteInsights =>
  !!value &&
  typeof value === "object" &&
  (value as { version?: unknown }).version === 2 &&
  Array.isArray((value as { chapters?: unknown }).chapters);

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
