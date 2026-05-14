import type { ChatSessionMessage } from "./llm";
import type {
  TranscriptSegment,
  VideoNoteHighlight,
  VideoNoteInsights,
} from "./video-note";
import type { StreamOption } from "./youtube";

export interface LocalAudioMetaInfo {
  type: "local";
  filePath: string;
}

export interface RemoteAudioMetaInfo {
  type: "remote";
  url: string;
}

export interface XiaoyuzhouAudioMetaInfo {
  type: "xiaoyuzhou";
  episodeId: string;
  audioUrl?: string;
  podcastName?: string;
  episodeTitle?: string;
  coverUrl?: string;
  duration?: number;
}

export interface BilibiliAudioMetaInfo {
  type: "bilibili";
  bvid: string;
  cid: string;
  quality?: number;
  title?: string;
  thumbnail?: string;
}

export interface YouTubeAudioMetaInfo {
  type: "youtube";
  url: string;
  audioStream: StreamOption;
  title?: string;
  thumbnail?: string;
}

export type AudioMetaInfo =
  | LocalAudioMetaInfo
  | RemoteAudioMetaInfo
  | XiaoyuzhouAudioMetaInfo
  | BilibiliAudioMetaInfo
  | YouTubeAudioMetaInfo;

export interface AudioChapter {
  id: string;
  title: string;
  startTime: number; // ms
  endTime: number; // ms
  summary?: string;
}

export interface AudioSpeaker {
  id: string;
  name: string;
  color?: string;
}

export interface AudioNote {
  id: number;
  createTime: number;
  updateTime: number;
  metaInfo: AudioMetaInfo;
  description?: string;
  transcript?: string;
  transcriptSegments?: TranscriptSegment[];
  transcriptWordSegments?: TranscriptSegment[];
  summary?: string;
  highlights?: VideoNoteHighlight[];
  insights?: VideoNoteInsights;
  speakers?: AudioSpeaker[];
  chapters?: AudioChapter[];
}

export interface AudioNoteItem {
  id: number;
  createTime: number;
  updateTime: number;
  audioNoteId: number;
  contentId: number;
  title: string;
}

export interface CreateAudioNoteItem {
  audioNoteId: number;
  title: string;
}

export interface AudioNoteChatMessage {
  id: number;
  audioNoteId: number;
  createTime: number;
  updateTime: number;
  messages: ChatSessionMessage[];
  messageSchemaVersion?: number;
  title: string;
  archived?: boolean;
  parentChatId?: number | null;
  branchIndex?: number;
}

export interface CreateAudioNoteChat {
  audioNoteId: number;
  messages: ChatSessionMessage[];
  title?: string;
  parentChatId?: number | null;
  branchIndex?: number;
}

export interface UpdateAudioNoteChat {
  id: number;
  messages?: ChatSessionMessage[];
  title?: string;
  archived?: boolean;
  parentChatId?: number | null;
  branchIndex?: number;
}
