import type { StreamOption } from "./youtube";
import type { ChatSessionMessage } from "./llm";

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

export type VideoMetaInfo =
  LocalVideoMetaInfo | RemoteVideoMetaInfo | BiliBiliVideoMetaInfo | YouTubeVideoMetaInfo;

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

export interface VideoNoteChatMessage {
  id: number;
  videoNoteId: number;
  createTime: number;
  updateTime: number;
  messages: ChatSessionMessage[];
  messageSchemaVersion?: number;
  title: string;
  archived?: boolean;
  parentChatId?: number | null;
  branchIndex?: number;
}

export interface CreateVideoNoteChat {
  videoNoteId: number;
  messages: ChatSessionMessage[];
  title?: string;
  parentChatId?: number | null;
  branchIndex?: number;
}

export interface UpdateVideoNoteChat {
  id: number;
  messages?: ChatSessionMessage[];
  title?: string;
  archived?: boolean;
  parentChatId?: number | null;
  branchIndex?: number;
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
