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

/**
 * 资源状态（实时计算，不存储在数据库）
 */
export type VLResourceStatus =
  | "pending" // 待处理：markdown_path 为空
  | "converting" // 转换中：正在执行 MarkItDown 转换（内存队列状态）
  | "indexing" // 索引中：正在执行 FTS/Vec 索引（内存队列状态）
  | "completed" // 已完成：Markdown 文件存在 且 索引记录存在
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
}

/**
 * 创建资源参数
 */
export interface CreateVLResource {
  projectId: number;
  name: string;
  originalPath: string;
  resourceType: VLResourceType;
  fileSize?: number;
  duration?: number;
}

/**
 * 更新资源参数
 */
export interface UpdateVLResource {
  id: number;
  name?: string;
  markdownPath?: string | null;
  fileSize?: number;
  duration?: number;
}

/**
 * 索引任务类型
 */
export type VLIndexTaskType =
  | "full" // 完整处理：下载 + 转换 + 索引
  | "convert_only" // 仅转换：下载 + 转换（不索引）
  | "index_only"; // 仅索引：已有 Markdown，只需索引

/**
 * 索引任务状态
 */
export type VLIndexTaskStatus =
  | "pending"
  | "converting"
  | "indexing"
  | "completed"
  | "failed";

/**
 * 索引任务
 */
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

/**
 * 资源状态变更事件
 */
export interface VLStatusChangeEvent {
  resourceId: number;
  status: VLResourceStatus;
  error?: string;
}

/**
 * 搜索结果
 */
export interface VLSearchResult {
  resourceId: number;
  resourceName: string;
  content: string;
  score: number;
  chunkIndex?: number;
}

/**
 * 搜索参数
 */
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
