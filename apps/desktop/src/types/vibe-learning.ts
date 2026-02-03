import { ChatSessionMessage } from "@/types";

export type VLResourceType =
  | "pdf"
  | "audio"
  | "video"
  | "image"
  | "doc"
  | "docx"
  | "ppt"
  | "pptx"
  | "xls"
  | "xlsx"
  | "txt"
  | "md"
  | "html"
  | "other";

export type VLResourceSourceType =
  | "local" // 本地上传
  | "bilibili" // Bilibili 视频
  | "youtube" // YouTube 视频
  | "remote"; // 远程 URL

export interface BilibiliSourceMeta {
  bvid: string;
  cid: string;
  quality: number;
  title: string;
  thumbnail?: string;
}

export interface YoutubeSourceMeta {
  url: string;
  videoStream?: string;
  audioStream?: string;
  title?: string;
}

export interface RemoteSourceMeta {
  url: string;
  title?: string;
}

export type VLResourceSourceMeta =
  | BilibiliSourceMeta
  | YoutubeSourceMeta
  | RemoteSourceMeta;

export type VLResourceStatus =
  | "pending" // 待处理：markdown_path 为空
  | "downloading" // 下载中：正在下载远程视频（内存队列状态）
  | "transcribing" // 转录中：正在转录音视频（内存队列状态）
  | "converting" // 转换中：正在执行 MarkItDown 转换（内存队列状态）
  | "indexing" // 索引中：正在执行 FTS/Vec 索引（内存队列状态）
  | "completed" // 已完成：Markdown 文件存在 且 索引记录存在
  | "need_download" // 需要下载：远程视频本地缓存不存在
  | "need_convert" // 需要转换：markdown_path 有值但文件不存在
  | "need_index" // 需要索引：Markdown 文件存在但索引记录不存在
  | "failed"; // 失败：执行过程中出错（内存队列状态）

/**
 * Vibe Learning 资源（数据库记录）
 */
export interface VLResource {
  id: number;
  projectId: number;
  createTime: number;
  updateTime: number;
  name: string;
  originalPath: string; // 原始资源路径（云端 URL）
  markdownPath: string | null; // 转换后 Markdown 文件相对路径
  resourceType: VLResourceType;
  fileSize: number | null;
  duration: number | null; // 音视频时长（秒）
  sourceType: VLResourceSourceType | null; // 资源来源类型
  sourceMetaInfo: string | null; // 来源元信息（JSON 字符串）
}

export interface CreateVLResource {
  projectId: number;
  name: string;
  originalPath: string;
  resourceType: VLResourceType;
  fileSize?: number;
  duration?: number;
  sourceType?: VLResourceSourceType;
  sourceMetaInfo?: string;
}

export interface UpdateVLResource {
  id: number;
  name?: string;
  markdownPath?: string | null;
  fileSize?: number;
  duration?: number;
}

export type VLIndexTaskType =
  | "full" // 完整处理：下载 + 转换 + 索引
  | "convert_only" // 仅转换：下载 + 转换（不索引）
  | "index_only"; // 仅索引：已有 Markdown，只需索引

export type VLIndexTaskStatus =
  | "pending"
  | "converting"
  | "indexing"
  | "completed"
  | "failed";

export interface VLIndexTask {
  resourceId: number;
  projectId: number;
  mainDbName: string;
  originalPath: string;
  markdownPath?: string;
  type: VLIndexTaskType;
  status: VLIndexTaskStatus;
  retryCount: number;
  error?: string;
}

export interface VLStatusChangeEvent {
  resourceId: number;
  status: VLResourceStatus;
  error?: string;
}

export interface VLSearchResult {
  resourceId: number;
  resourceName: string;
  content: string;
  score: number;
  chunkIndex?: number;
}

export interface VLSearchParams {
  projectId: number;
  mainDbName: string;
  query: string;
  limit?: number;
}

export interface VLChatMessage {
  id: number;
  projectId: number;
  createTime: number;
  updateTime: number;
  messages: ChatSessionMessage[];
  title: string;
  archived?: boolean;
  parentChatId?: number | null;
  branchIndex?: number;
}

export interface CreateVLChat {
  projectId: number;
  messages: ChatSessionMessage[];
  title?: string;
  parentChatId?: number | null;
  branchIndex?: number;
}

export interface UpdateVLChat {
  id: number;
  messages?: ChatSessionMessage[];
  title?: string;
  archived?: boolean;
  parentChatId?: number | null;
  branchIndex?: number;
}

export type VLNoteType = "note" | "mindmap" | "ppt" | "podcast";

export interface VLNote {
  id: number;
  projectId: number;
  contentId: number;
  title: string;
  type: VLNoteType;
  podcastId: number | null; // 关联的播客 ID（仅 type=podcast 时有值）
  createTime: number;
  updateTime: number;
}

export interface CreateVLNote {
  projectId: number;
  contentId: number;
  title: string;
  type?: VLNoteType;
  podcastId?: number; // 关联的播客 ID（仅 type=podcast 时需要）
}

export interface UpdateVLNote {
  id: number;
  title?: string;
  podcastId?: number | null;
}
