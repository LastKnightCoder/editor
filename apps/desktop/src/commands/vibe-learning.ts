import { invoke } from "@/electron";
import type {
  VLResource,
  CreateVLResource,
  UpdateVLResource,
  VLChatMessage,
  CreateVLChat,
  UpdateVLChat,
  VLNote,
  CreateVLNote,
  UpdateVLNote,
} from "@/types/vibe-learning";

export const createVLResource = async (
  params: CreateVLResource,
): Promise<VLResource> => {
  return await invoke("vl-create-resource", params);
};

export const updateVLResource = async (
  params: UpdateVLResource,
): Promise<VLResource | null> => {
  return await invoke("vl-update-resource", params);
};

export const updateVLMarkdownPath = async (
  id: number,
  markdownPath: string,
): Promise<boolean> => {
  return await invoke("vl-update-markdown-path", id, markdownPath);
};

export const deleteVLResource = async (id: number): Promise<boolean> => {
  return await invoke("vl-delete-resource", id);
};

export const deleteVLResourceComplete = async (params: {
  resourceId: number;
  projectId: number;
  mainDbName: string;
  markdownPath?: string;
}): Promise<boolean> => {
  return await invoke("vl-delete-resource-complete", params);
};

/**
 * 根据 ID 获取资源
 */
export const getVLResourceById = async (
  id: number,
): Promise<VLResource | null> => {
  return await invoke("vl-get-resource", id);
};

/**
 * 根据项目 ID 获取所有资源
 */
export const getVLResourcesByProjectId = async (
  projectId: number,
): Promise<VLResource[]> => {
  return await invoke("vl-get-resources-by-project", projectId);
};

/**
 * 获取所有资源
 */
export const getAllVLResources = async (): Promise<VLResource[]> => {
  return await invoke("vl-get-all-resources");
};

/**
 * 根据 ID 列表获取资源
 */
export const getVLResourcesByIds = async (
  ids: number[],
): Promise<VLResource[]> => {
  return await invoke("vl-get-resources-by-ids", ids);
};

/**
 * 检查 Markdown 文件是否存在
 */
export const checkMarkdownExists = async (
  markdownPath: string,
): Promise<boolean> => {
  return await invoke("vl-check-markdown-exists", markdownPath);
};

/**
 * 检查资源索引是否存在
 */
export const checkVLIndexExists = async (
  mainDbName: string,
  projectId: number,
  resourceId: number,
): Promise<boolean> => {
  return await invoke(
    "vl-check-index-exists",
    mainDbName,
    projectId,
    resourceId,
  );
};

/**
 * 添加索引任务到队列
 */
export const addVLIndexTask = async (params: {
  resourceId: number;
  projectId: number;
  mainDbName: string;
  originalPath: string;
  resourceName: string;
  markdownPath?: string;
  type: "full" | "convert_only" | "index_only";
}): Promise<void> => {
  return await invoke("vl-add-index-task", params);
};

/**
 * 获取队列状态
 */
export const getVLQueueStatus = async (): Promise<{
  pending: number;
  processing: number;
}> => {
  return await invoke("vl-get-queue-status");
};

/**
 * 搜索 Vibe Learning 内容
 */
export const searchVLContent = async (params: {
  projectId: number;
  mainDbName: string;
  query: string;
  limit?: number;
}): Promise<
  Array<{
    resourceId: number;
    resourceName: string;
    content: string;
    score: number;
  }>
> => {
  return await invoke("vl-search-content", params);
};

/**
 * 重建所有项目的向量表（维度变化时调用）
 */
export const vlReinitAllVecTables = async (
  dimensions: number,
): Promise<boolean> => {
  return await invoke("vl-reinit-all-vec-tables", dimensions);
};

/**
 * 重新 embedding 所有资源
 */
export const vlReembeddingAllResources = async (): Promise<boolean> => {
  return await invoke("vl-reembedding-all-resources");
};

/**
 * 清除 embedding 配置缓存
 */
export const vlClearEmbeddingCache = async (): Promise<boolean> => {
  return await invoke("vl-clear-embedding-cache");
};

export type VLEmbeddingSwitchReason = "config_switch" | "model_switch";

export interface VLRebuildAfterEmbeddingSwitchResult {
  reinitOk: boolean;
  queued: number;
  droppedPending: number;
  previousGeneration: number;
  currentGeneration: number;
  reason: VLEmbeddingSwitchReason;
}

export const vlRebuildAfterEmbeddingSwitch = async (
  dimensions: number,
  reason: VLEmbeddingSwitchReason = "model_switch",
  mainDbName?: string,
): Promise<VLRebuildAfterEmbeddingSwitchResult> => {
  return await invoke("vl-rebuild-after-embedding-switch", {
    dimensions,
    reason,
    mainDbName,
  });
};

/**
 * 创建 VL 对话
 */
export const createVLChat = async (
  params: CreateVLChat,
): Promise<VLChatMessage> => {
  return await invoke("vl-create-chat", params);
};

/**
 * 更新 VL 对话
 */
export const updateVLChat = async (
  params: UpdateVLChat,
): Promise<VLChatMessage | null> => {
  return await invoke("vl-update-chat", params);
};

/**
 * 删除 VL 对话
 */
export const deleteVLChat = async (id: number): Promise<boolean> => {
  return await invoke("vl-delete-chat", id);
};

/**
 * 根据 ID 获取 VL 对话
 */
export const getVLChatById = async (
  id: number,
): Promise<VLChatMessage | null> => {
  return await invoke("vl-get-chat", id);
};

/**
 * 根据项目 ID 获取所有 VL 对话
 */
export const getVLChatsByProjectId = async (
  projectId: number,
): Promise<VLChatMessage[]> => {
  return await invoke("vl-get-chats-by-project", projectId);
};

/**
 * 获取 VL 对话分支
 */
export const getVLChatBranches = async (
  parentChatId: number,
): Promise<VLChatMessage[]> => {
  return await invoke("vl-get-chat-branches", parentChatId);
};

/**
 * 获取下一个分支索引
 */
export const getVLNextBranchIndex = async (
  parentChatId: number,
): Promise<number> => {
  return await invoke("vl-get-next-branch-index", parentChatId);
};

/**
 * 获取子分支数量（包括所有层级的子分支）
 */
export const getVLChildBranchesCount = async (
  parentChatId: number,
): Promise<number> => {
  return await invoke("vl-get-child-branches-count", parentChatId);
};

/**
 * 读取资源的完整 Markdown 内容
 */
export const readVLResourceContent = async (
  projectId: number,
  resourceName: string,
  mainDbName: string,
): Promise<{
  success: boolean;
  content?: string;
  totalLines?: number;
  resourceName?: string;
  isChunked?: boolean;
  chapterCount?: number;
  error?: string;
}> => {
  return await invoke("vl-read-markdown-content", {
    projectId,
    resourceName,
    mainDbName,
  });
};

/**
 * 读取资源的章节内容
 */
export const readVLChapterContent = async (
  projectId: number,
  resourceName: string,
  mainDbName: string,
  chapterIndex: number,
): Promise<{
  success: boolean;
  content?: string;
  chapterTitle?: string;
  chapterIndex?: number;
  totalChapters?: number;
  resourceName?: string;
  error?: string;
}> => {
  return await invoke("vl-read-chapter-content", {
    projectId,
    resourceName,
    mainDbName,
    chapterIndex,
  });
};

/**
 * 列出资源的所有章节
 */
export const listVLChapters = async (
  projectId: number,
  resourceName: string,
  mainDbName: string,
): Promise<{
  success: boolean;
  chapters?: Array<{
    index: number;
    title: string;
    charCount: number;
  }>;
  resourceName?: string;
  error?: string;
}> => {
  return await invoke("vl-list-chapters", {
    projectId,
    resourceName,
    mainDbName,
  });
};

/**
 * 深度阅读资源
 */
export const deepReadVLResource = async (
  projectId: number,
  resourceName: string,
  mainDbName: string,
  question: string,
  focusChapters?: number[],
): Promise<{
  success: boolean;
  answer?: string;
  analyzedChapters?: number[];
  error?: string;
}> => {
  return await invoke("vl-deep-read-resource", {
    projectId,
    resourceName,
    mainDbName,
    question,
    focusChapters,
  });
};

/**
 * 按行范围读取资源的 Markdown 内容
 */
export const readVLResourceContentRange = async (
  projectId: number,
  resourceName: string,
  mainDbName: string,
  startLine: number,
  endLine: number,
): Promise<{
  success: boolean;
  content?: string;
  startLine?: number;
  endLine?: number;
  totalLines?: number;
  resourceName?: string;
  error?: string;
}> => {
  return await invoke("vl-read-markdown-range", {
    projectId,
    resourceName,
    mainDbName,
    startLine,
    endLine,
  });
};

// ==================== VL 笔记相关 ====================

/**
 * 创建 VL 笔记
 */
export const createVLNote = async (params: CreateVLNote): Promise<VLNote> => {
  return await invoke("vl-note:create", params);
};

/**
 * 更新 VL 笔记
 */
export const updateVLNote = async (
  params: UpdateVLNote,
): Promise<VLNote | null> => {
  return await invoke("vl-note:update", params);
};

/**
 * 删除 VL 笔记
 */
export const deleteVLNote = async (id: number): Promise<number> => {
  return await invoke("vl-note:delete", id);
};

/**
 * 根据 ID 获取 VL 笔记
 */
export const getVLNoteById = async (id: number): Promise<VLNote | null> => {
  return await invoke("vl-note:get", id);
};

/**
 * 根据项目 ID 获取所有 VL 笔记
 */
export const getVLNotesByProjectId = async (
  projectId: number,
): Promise<VLNote[]> => {
  return await invoke("vl-note:list-by-project", projectId);
};
