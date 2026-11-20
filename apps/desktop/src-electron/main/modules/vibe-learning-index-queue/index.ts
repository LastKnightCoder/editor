import { EventEmitter } from "events";
import { ipcMain, BrowserWindow } from "electron";
import log from "electron-log";
import vibeLearningMediaCache from "../vibe-learning-media-cache";
import type { Module } from "../../types/module";
import type { TaskProgress, VLSearchResult } from "@/types/vibe-learning";
import {
  getEmbeddingConfig,
  clearEmbeddingConfigCache,
  getTranscriptionConfig,
  clearTranscriptionConfigCache,
  getImageDescriptionConfig,
  clearImageDescriptionConfigCache,
} from "./llm-configs";
import { sendStatusWithProgress } from "./broadcast";
import {
  isTaskStale,
  throwIfTaskStale,
  clearQueueForNewGeneration,
  getCurrentGenerationQueuedCount,
  rebuildQueueForEmbeddingSwitch,
  abortCurrentRun,
  handleEmbeddingSwitchByPolicy,
  addTask,
  getResourceStatus,
  getResourceStatuses,
  getQueueStatus,
  processQueue,
  processTask,
  deleteResourceComplete,
} from "./queue";
import {
  processMaterialResource,
  processNoteResource,
  processOnlineVideo,
} from "./source-converters";
import { processMediaResource } from "./media-pipeline";
import { createIndex, createEmbeddingOnly } from "./indexing";
import { searchContent, grepContent } from "./search";
import {
  checkAndRecoverResources,
  computeResourceStatus,
  reinitAllVecTables,
  reembeddingAllResources,
} from "./recovery";
import { checkMarkdownExists } from "./markdown-store";
import {
  readMarkdownContent,
  readMarkdownRange,
  readResourceLines,
  readResourceRange,
  readSearchHitContext,
} from "./reading";
import type {
  EmbeddingConfig,
  TranscriptionConfig,
  ImageDescriptionConfig,
  IndexTask,
  AddTaskResult,
  TaskStatus,
  RebuildQueueForEmbeddingSwitchParams,
  RebuildQueueForEmbeddingSwitchResult,
  HandleEmbeddingSwitchByPolicyParams,
  HandleEmbeddingSwitchByPolicyResult,
  RecoverResourcesOptions,
} from "./types";

export class VibeLearningIndexQueue extends EventEmitter implements Module {
  name: string;
  queue: IndexTask[] = [];
  activeTaskCount = 0;
  maxConcurrency = 2;
  isProcessing = false;
  queueGeneration = 0;

  // 内存中记录当前正在处理的任务状态
  processingStatus: Map<number, TaskStatus> = new Map();
  // 记录最近一次“带进度”的状态，用于重启后快照同步
  taskProgressMap: Map<number, { status: TaskStatus; taskProgress: TaskProgress }> = new Map();

  // 缓存 embedding 配置
  cachedEmbeddingConfig: EmbeddingConfig | null | undefined = undefined;

  // 缓存转译配置
  cachedTranscriptionConfig: TranscriptionConfig | null | undefined = undefined;

  // 缓存图片描述配置
  cachedImageDescriptionConfig: ImageDescriptionConfig | null | undefined = undefined;

  constructor() {
    super();
    this.name = "vibe-learning-index-queue";
  }

  /**
   * 从 setting.json 读取 embedding 配置
   */
  getEmbeddingConfig(): Promise<EmbeddingConfig | null> {
    return getEmbeddingConfig(this);
  }

  /**
   * 清除 embedding 配置缓存（配置变更时调用）
   */
  clearEmbeddingConfigCache(): void {
    return clearEmbeddingConfigCache(this);
  }

  /**
   * 从 setting.json 读取转译配置
   */
  getTranscriptionConfig(): Promise<TranscriptionConfig | null> {
    return getTranscriptionConfig(this);
  }

  /**
   * 清除转译配置缓存（配置变更时调用）
   */
  clearTranscriptionConfigCache(): void {
    return clearTranscriptionConfigCache(this);
  }

  /**
   * 从 setting.json 读取图片描述 LLM 配置
   */
  getImageDescriptionConfig(): Promise<ImageDescriptionConfig | null> {
    return getImageDescriptionConfig(this);
  }

  /**
   * 清除图片描述配置缓存（配置变更时调用）
   */
  clearImageDescriptionConfigCache(): void {
    return clearImageDescriptionConfigCache(this);
  }

  async init() {
    // 注册 IPC 处理器
    ipcMain.handle("vl-add-index-task", async (_event, params) => {
      return this.addTask(params);
    });

    ipcMain.handle("vl-get-queue-status", async () => {
      return this.getQueueStatus();
    });

    ipcMain.handle("vl-get-resource-status", async (_event, resourceId: number) => {
      return this.getResourceStatus(resourceId);
    });

    ipcMain.handle("vl-get-resource-statuses", async (_event, resourceIds: number[]) => {
      return this.getResourceStatuses(resourceIds);
    });

    ipcMain.handle("vl-check-markdown-exists", async (_event, relativePath: string) => {
      return this.checkMarkdownExists(relativePath);
    });

    ipcMain.handle("vl-search-content", async (_event, params) => {
      return this.searchContent(params);
    });

    ipcMain.handle(
      "vl-rebuild-after-embedding-switch",
      async (_event, params: RebuildQueueForEmbeddingSwitchParams) => {
        return this.rebuildQueueForEmbeddingSwitch(params);
      }
    );

    // 重建所有项目的向量表（维度变化时调用）
    ipcMain.handle("vl-reinit-all-vec-tables", async (_event, dimensions: number) => {
      return this.reinitAllVecTables(dimensions);
    });

    // 重新 embedding 所有资源
    ipcMain.handle("vl-reembedding-all-resources", async () => {
      return this.reembeddingAllResources();
    });

    // 清除 embedding 配置缓存
    ipcMain.handle("vl-clear-embedding-cache", async () => {
      this.clearEmbeddingConfigCache();
      return true;
    });

    ipcMain.handle("vl-clear-media-processing-cache", async () => {
      const result = await vibeLearningMediaCache.clearAll();
      log.info(
        `[VibeLearningIndexQueue] Cleared media processing cache: files=${result.removedFiles}, bytes=${result.removedBytes}`
      );
      return result;
    });

    // 读取 Markdown 完整内容
    ipcMain.handle(
      "vl-read-markdown-content",
      async (_event, params: { projectId: number; resourceName: string; mainDbName: string }) => {
        return this.readMarkdownContent(params);
      }
    );

    // 按行范围读取 Markdown 内容（旧名称保留给现有 UI 调用）
    ipcMain.handle(
      "vl-read-markdown-range",
      async (
        _event,
        params: {
          projectId: number;
          resourceName: string;
          mainDbName: string;
          startLine: number;
          endLine: number;
        }
      ) => {
        return this.readMarkdownRange(params);
      }
    );

    ipcMain.handle(
      "vl-read-resource-lines",
      async (
        _event,
        params: {
          projectId: number;
          resourceId?: number;
          resourceName?: string;
          mainDbName: string;
          startLine: number;
          endLine: number;
        }
      ) => {
        return this.readResourceLines(params);
      }
    );

    ipcMain.handle(
      "vl-read-resource-range",
      async (
        _event,
        params: {
          projectId: number;
          resourceId?: number;
          resourceName?: string;
          mainDbName: string;
          startOffset: number;
          endOffset: number;
        }
      ) => {
        return this.readResourceRange(params);
      }
    );

    ipcMain.handle(
      "vl-grep-content",
      async (
        _event,
        params: {
          projectId: number;
          mainDbName: string;
          query: string;
          isRegex?: boolean;
          ignoreCase?: boolean;
          limit?: number;
        }
      ) => {
        return this.grepContent(params);
      }
    );

    ipcMain.handle(
      "vl-delete-resource-complete",
      async (
        _event,
        params: {
          resourceId: number;
          projectId: number;
          mainDbName: string;
          markdownPath?: string;
        }
      ) => {
        return this.deleteResourceComplete(params);
      }
    );

    // 监听状态变更并通知所有窗口
    this.on("status-change", (resourceId: number, status: TaskStatus, error?: string) => {
      BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
          win.webContents.send("vibe-learning-status-change", {
            resourceId,
            status,
            error,
          });
        }
      });
    });

    log.info("[VibeLearningIndexQueue] Module initialized");
  }

  isTaskStale(task: Pick<IndexTask, "resourceId" | "generation">): boolean {
    return isTaskStale(this, task);
  }

  throwIfTaskStale(task: Pick<IndexTask, "resourceId" | "generation">, stage: string): void {
    return throwIfTaskStale(this, task, stage);
  }

  clearQueueForNewGeneration(): { droppedPending: number } {
    return clearQueueForNewGeneration(this);
  }

  getCurrentGenerationQueuedCount(): number {
    return getCurrentGenerationQueuedCount(this);
  }

  rebuildQueueForEmbeddingSwitch(
    params: RebuildQueueForEmbeddingSwitchParams
  ): Promise<RebuildQueueForEmbeddingSwitchResult> {
    return rebuildQueueForEmbeddingSwitch(this, params);
  }

  /**
   * 立即使当前队列中的所有任务失效，
   * 用于数据库切换时在 orchestrator 链外部快速中止旧任务
   */
  abortCurrentRun(): void {
    return abortCurrentRun(this);
  }

  handleEmbeddingSwitchByPolicy(
    params: HandleEmbeddingSwitchByPolicyParams
  ): Promise<HandleEmbeddingSwitchByPolicyResult> {
    return handleEmbeddingSwitchByPolicy(this, params);
  }

  /**
   * 发送带进度数据的状态变更事件
   * taskProgress 是通用进度，status 字段标识当前阶段（转录/拆分/索引等）
   */
  sendStatusWithProgress(
    resourceId: number,
    status: TaskStatus,
    taskProgress?: TaskProgress
  ): void {
    return sendStatusWithProgress(this, resourceId, status, taskProgress);
  }

  /**
   * 添加任务到队列
   */
  addTask(task: Omit<IndexTask, "status" | "retryCount" | "generation">): AddTaskResult {
    return addTask(this, task);
  }

  /**
   * 获取资源的处理状态
   */
  getResourceStatus(resourceId: number): TaskStatus | null {
    return getResourceStatus(this, resourceId);
  }

  getResourceStatuses(
    resourceIds: number[]
  ): Record<number, { status: TaskStatus | null; taskProgress?: TaskProgress }> {
    return getResourceStatuses(this, resourceIds);
  }

  /**
   * 获取队列状态
   */
  getQueueStatus(): { pending: number; processing: number } {
    return getQueueStatus(this);
  }

  /**
   * 开始处理队列
   */
  processQueue(): Promise<void> {
    return processQueue(this);
  }

  /**
   * 处理单个任务
   */
  processTask(task: IndexTask): Promise<void> {
    return processTask(this, task);
  }

  processMaterialResource(
    resourceId: number,
    sourceMetaInfo: string,
    mainDbName: string
  ): Promise<string> {
    return processMaterialResource(this, resourceId, sourceMetaInfo, mainDbName);
  }

  processNoteResource(
    resourceId: number,
    sourceMetaInfo: string,
    mainDbName: string
  ): Promise<string> {
    return processNoteResource(this, resourceId, sourceMetaInfo, mainDbName);
  }

  /**
   * 处理在线视频：经提供方插件取源并缓存到本地，然后走统一媒体处理管线
   */
  processOnlineVideo(
    resourceId: number,
    providerId: string,
    sourceMetaInfo: string,
    resourceName: string,
    mainDbName: string,
    pageUrl?: string
  ): Promise<string> {
    return processOnlineVideo(
      this,
      resourceId,
      providerId,
      sourceMetaInfo,
      resourceName,
      mainDbName,
      pageUrl
    );
  }

  /**
   * 统一媒体处理管线
   * 所有视频/音频资源（在线视频、本地、远程等）获取到本地文件后统一走此方法
   */
  processMediaResource(
    localFilePath: string,
    resourceId: number,
    resourceName: string,
    mainDbName: string,
    sourceStableId: string,
    videoUrl?: string
  ): Promise<string> {
    return processMediaResource(
      this,
      localFilePath,
      resourceId,
      resourceName,
      mainDbName,
      sourceStableId,
      videoUrl
    );
  }

  createIndex(
    mainDbName: string,
    projectId: number,
    resourceId: number,
    content: string,
    task?: Pick<IndexTask, "resourceId" | "generation">
  ): Promise<void> {
    return createIndex(this, mainDbName, projectId, resourceId, content, task);
  }

  createEmbeddingOnly(
    mainDbName: string,
    projectId: number,
    resourceId: number,
    content: string,
    task?: Pick<IndexTask, "resourceId" | "generation">
  ): Promise<void> {
    return createEmbeddingOnly(this, mainDbName, projectId, resourceId, content, task);
  }

  checkMarkdownExists(relativePath: string): Promise<boolean> {
    return checkMarkdownExists(relativePath);
  }

  deleteResourceComplete(params: {
    resourceId: number;
    projectId: number;
    mainDbName: string;
    markdownPath?: string;
  }): Promise<boolean> {
    return deleteResourceComplete(this, params);
  }

  readMarkdownContent(params: {
    projectId: number;
    resourceName: string;
    mainDbName: string;
  }): Promise<{
    success: boolean;
    content?: string;
    totalLines?: number;
    resourceName?: string;
    error?: string;
  }> {
    return readMarkdownContent(params);
  }

  readMarkdownRange(params: {
    projectId: number;
    resourceName: string;
    mainDbName: string;
    startLine: number;
    endLine: number;
  }): Promise<{
    success: boolean;
    content?: string;
    startLine?: number;
    endLine?: number;
    totalLines?: number;
    resourceName?: string;
    error?: string;
  }> {
    return readMarkdownRange(params);
  }

  readResourceLines(params: {
    projectId: number;
    resourceId?: number;
    resourceName?: string;
    mainDbName: string;
    startLine: number;
    endLine: number;
  }): Promise<{
    success: boolean;
    content?: string;
    resourceId?: number;
    resourceName?: string;
    startLine?: number;
    endLine?: number;
    totalLines?: number;
    truncated?: boolean;
    error?: string;
  }> {
    return readResourceLines(params);
  }

  readResourceRange(params: {
    projectId: number;
    resourceId?: number;
    resourceName?: string;
    mainDbName: string;
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
  }> {
    return readResourceRange(params);
  }

  readSearchHitContext(params: {
    projectId: number;
    resourceName: string;
    mainDbName: string;
    chunkIndex: number;
    radius?: number;
  }): Promise<{
    success: boolean;
    resourceName?: string;
    chunkIndex?: number;
    startChunkIndex?: number;
    endChunkIndex?: number;
    chunkStartLine?: number;
    chunkEndLine?: number;
    startOffset?: number;
    endOffset?: number;
    content?: string;
    error?: string;
  }> {
    return readSearchHitContext(params);
  }

  searchContent(params: {
    projectId: number;
    mainDbName: string;
    query: string;
    limit?: number;
  }): Promise<VLSearchResult[]> {
    return searchContent(this, params);
  }

  grepContent(params: {
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
  }> {
    return grepContent(params);
  }

  checkAndRecoverResources(
    mainDbName: string,
    options: RecoverResourcesOptions = {}
  ): Promise<void> {
    return checkAndRecoverResources(this, mainDbName, options);
  }

  /**
   * 计算资源状态
   */
  computeResourceStatus(
    resource: {
      id: number;
      projectId: number;
      markdownPath: string | null;
      originalPath?: string;
      sourceType?: string | null;
      sourceMetaInfo?: string | null;
    },
    mainDbName: string,
    options: RecoverResourcesOptions = {}
  ): Promise<string> {
    return computeResourceStatus(this, resource, mainDbName, options);
  }

  reinitAllVecTables(dimensions: number, mainDbName?: string): Promise<boolean> {
    return reinitAllVecTables(this, dimensions, mainDbName);
  }

  reembeddingAllResources(): Promise<boolean> {
    return reembeddingAllResources(this);
  }
}

const vibeLearningIndexQueue = new VibeLearningIndexQueue();
export default vibeLearningIndexQueue;
