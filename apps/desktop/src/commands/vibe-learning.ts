import { invoke } from "@/electron";
import { queryClient } from "@/queryClient";
import type {
  VLResource,
  VLResourceStatus,
  TaskProgress,
  CreateVLResource,
  UpdateVLResource,
  VLNote,
  CreateVLNote,
  UpdateVLNote,
  VLNoteType,
} from "@/types/vibe-learning";

export type VLAddTaskResult =
  | { accepted: true; reason: "queued_new" | "updated_pending" }
  | {
      accepted: false;
      reason: "already_running";
      currentStatus: VLResourceStatus;
    };

export const createVLResource = async (params: CreateVLResource): Promise<VLResource> => {
  const resource = await invoke<VLResource>("vl-create-resource", params);
  invalidateResourceCount();
  return resource;
};

function invalidateResourceCount() {
  void queryClient.invalidateQueries({ queryKey: ["vibe-learning", "list"] });
}

export const ensureVLNoteResource = async (params: {
  projectId: number;
  mainDbName: string;
  contentId: number;
  title: string;
  noteType: VLNoteType | string;
  originalId: number;
  enqueueIndex?: boolean;
}): Promise<{ resource: VLResource; created: boolean }> => {
  const result = await invoke<{ resource: VLResource; created: boolean }>(
    "vl-ensure-note-resource",
    {
      projectId: params.projectId,
      contentId: params.contentId,
      title: params.title,
      noteType: params.noteType,
      originalId: params.originalId,
    }
  );

  // 资源已落库，即使后续索引入队失败，列表数量也应刷新。
  if (result.created) invalidateResourceCount();

  if (result.created && params.enqueueIndex !== false) {
    await addVLIndexTask({
      resourceId: result.resource.id,
      projectId: params.projectId,
      mainDbName: params.mainDbName,
      originalPath: result.resource.originalPath,
      resourceName: result.resource.name,
      type: "full",
    });
  }

  return result;
};

export const updateVLResource = async (params: UpdateVLResource): Promise<VLResource | null> => {
  return await invoke("vl-update-resource", params);
};

export const updateVLMarkdownPath = async (id: number, markdownPath: string): Promise<boolean> => {
  return await invoke("vl-update-markdown-path", id, markdownPath);
};

export const deleteVLResource = async (id: number): Promise<boolean> => {
  const deleted = await invoke<boolean>("vl-delete-resource", id);
  if (deleted) invalidateResourceCount();
  return deleted;
};

export const deleteVLResourceComplete = async (params: {
  resourceId: number;
  projectId: number;
  mainDbName: string;
  markdownPath?: string;
}): Promise<boolean> => {
  const deleted = await invoke<boolean>("vl-delete-resource-complete", params);
  if (deleted) invalidateResourceCount();
  return deleted;
};

/**
 * 根据 ID 获取资源
 */
export const getVLResourceById = async (id: number): Promise<VLResource | null> => {
  return await invoke("vl-get-resource", id);
};

/**
 * 根据项目 ID 获取所有资源
 */
export const getVLResourcesByProjectId = async (projectId: number): Promise<VLResource[]> => {
  return await invoke("vl-get-resources-by-project", projectId);
};

export const reorderVLResources = async (
  projectId: number,
  orderedIds: number[]
): Promise<number> => {
  return await invoke("vl-reorder-resources", { projectId, orderedIds });
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
export const getVLResourcesByIds = async (ids: number[]): Promise<VLResource[]> => {
  return await invoke("vl-get-resources-by-ids", ids);
};

/**
 * 检查 Markdown 文件是否存在
 */
export const checkMarkdownExists = async (markdownPath: string): Promise<boolean> => {
  return await invoke("vl-check-markdown-exists", markdownPath);
};

/**
 * 检查资源索引是否存在
 */
export const checkVLIndexExists = async (
  mainDbName: string,
  projectId: number,
  resourceId: number
): Promise<boolean> => {
  return await invoke("vl-check-index-exists", mainDbName, projectId, resourceId);
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
}): Promise<VLAddTaskResult> => {
  return await invoke("vl-add-index-task", params);
};

export const getVLResourceStatuses = async (
  resourceIds: number[]
): Promise<Record<number, { status: VLResourceStatus | null; taskProgress?: TaskProgress }>> => {
  return await invoke("vl-get-resource-statuses", resourceIds);
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
    displayContent?: string;
    searchContent?: string;
    score: number;
    chunkIndex?: number;
    chunkLevel?: "resource" | "passage";
    chunkStartLine?: number;
    chunkEndLine?: number;
    startOffset?: number;
    endOffset?: number;
    charCount?: number;
    whyMatched?: string;
    rrfScore?: number;
  }>
> => {
  return await invoke("vl-search-content", params);
};

/**
 * 重建所有项目的向量表（维度变化时调用）
 */
export const vlReinitAllVecTables = async (dimensions: number): Promise<boolean> => {
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

export const clearVLMediaProcessingCache = async (): Promise<{
  removedFiles: number;
  removedBytes: number;
}> => {
  return await invoke("vl-clear-media-processing-cache");
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
  mainDbName?: string
): Promise<VLRebuildAfterEmbeddingSwitchResult> => {
  return await invoke("vl-rebuild-after-embedding-switch", {
    dimensions,
    reason,
    mainDbName,
  });
};

/**
 * 读取资源的完整 Markdown 内容
 */
export const readVLResourceContent = async (
  projectId: number,
  resourceName: string,
  mainDbName: string
): Promise<{
  success: boolean;
  content?: string;
  totalLines?: number;
  resourceName?: string;
  error?: string;
}> => {
  return await invoke("vl-read-markdown-content", {
    projectId,
    resourceName,
    mainDbName,
  });
};

/**
 * 按行范围读取资源的 Markdown 内容
 */
export const readVLResourceLines = async (params: {
  projectId: number;
  mainDbName: string;
  resourceId?: number;
  resourceName?: string;
  startLine: number;
  endLine: number;
}): Promise<{
  success: boolean;
  content?: string;
  resourceId?: number;
  startLine?: number;
  endLine?: number;
  totalLines?: number;
  resourceName?: string;
  truncated?: boolean;
  error?: string;
}> => {
  return await invoke("vl-read-resource-lines", params);
};

export const readVLResourceContentRange = async (
  projectId: number,
  resourceName: string,
  mainDbName: string,
  startLine: number,
  endLine: number
): Promise<{
  success: boolean;
  content?: string;
  startLine?: number;
  endLine?: number;
  totalLines?: number;
  resourceName?: string;
  truncated?: boolean;
  error?: string;
}> => {
  return await readVLResourceLines({
    projectId,
    mainDbName,
    resourceName,
    startLine,
    endLine,
  });
};

export const readVLResourceRange = async (params: {
  projectId: number;
  mainDbName: string;
  resourceId?: number;
  resourceName?: string;
  startOffset: number;
  endOffset: number;
}): Promise<{
  success: boolean;
  content?: string;
  resourceId?: number;
  resourceName?: string;
  startOffset?: number;
  endOffset?: number;
  totalChars?: number;
  truncated?: boolean;
  error?: string;
}> => {
  return await invoke("vl-read-resource-range", params);
};

export const grepVLResourceContent = async (params: {
  projectId: number;
  mainDbName: string;
  query: string;
  isRegex?: boolean;
  ignoreCase?: boolean;
  limit?: number;
}): Promise<{
  success: boolean;
  query: string;
  results: Array<{
    resourceId: number;
    resourceName: string;
    lineNumber: number;
    startOffset: number;
    endOffset: number;
    matchedText: string;
    preview: string;
  }>;
  error?: string;
}> => {
  return await invoke("vl-grep-content", params);
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
export const updateVLNote = async (params: UpdateVLNote): Promise<VLNote | null> => {
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
export const getVLNotesByProjectId = async (projectId: number): Promise<VLNote[]> => {
  return await invoke("vl-note:list-by-project", projectId);
};
