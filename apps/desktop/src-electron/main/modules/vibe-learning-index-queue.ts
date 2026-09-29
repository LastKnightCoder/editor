import { EventEmitter } from "events";
import { ipcMain, BrowserWindow, app } from "electron";
import { promises as fs } from "fs";
import { join, dirname, extname } from "node:path";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createInterface } from "node:readline";
import { spawn } from "node:child_process";
import os from "node:os";
import log from "electron-log";
import fetch from "node-fetch";
import OpenAI from "openai";
import { rgPath } from "@vscode/ripgrep";
import { Module } from "../types/module";
import { toUnpackedAsarPath } from "../utils/asarPath";
import PathUtil from "../utils/PathUtil";
import vibeLearningDBManager from "./vibe-learning-db";
import markitdownModule from "./markitdown";
import databaseModule from "./database";
import transcriptionModule, { type TranscriptionResult } from "./transcription";
import { normalizeModelSize } from "../utils/transcription-model";
import VibeLearningResourceTable from "./tables/vibe-learning-resource";
import { cacheBilibiliVideo, getBilibiliCacheStatus } from "./bilibili-cache";
import { cacheYoutubeVideo, getYoutubeCacheStatus } from "./youtube-cache";
import vibeLearningMediaCache, { hashPayload, hashString } from "./vibe-learning-media-cache";
import { Jieba } from "@node-rs/jieba";
import { dict } from "@node-rs/jieba/dict";
import crypto from "node:crypto";
import PiAiRuntimeModule from "./pi-ai-runtime";
import { resolveUsageSlot, type LlmRef, type SettingForLlmSlots } from "./llm-usage-slot";
import type {
  BilibiliSourceMeta,
  NoteSourceMeta,
  YoutubeSourceMeta,
  VLSearchResult,
} from "@/types/vibe-learning";
import type { StreamOption } from "@/types/youtube";
import type { EmbeddingProviderType } from "@/types/embedding";
import ContentTable from "./tables/content";
import { getMarkdown } from "@/utils/markdown.ts";
import type { TaskProgress } from "@/types/vibe-learning";
import {
  TRANSCRIPTION_OPTIMIZATION_SYSTEM_PROMPT,
  buildTranscriptionOptimizationUserPrompt,
} from "@/constants/prompts/transcription-optimization";
import { DEFAULT_LOCAL_EMBEDDING_DISTANCE, LOCAL_EMBEDDING_CONFIG_ID } from "@/constants/embedding";
import localInference from "./local-inference";
import { smartChunk, smartChunkWithRanges } from "../utils/smart-chunk";
import YtDlpService from "../utils/YtDlpService";
import { runSearchPipeline } from "./search-core/pipeline";
import { createVibeLearningAdapter } from "./search-core/vibe-learning-adapter";
import {
  buildVLTranscriptionOptions,
  resolveVLOptimizationLanguage,
  type VLTranscriptionModelSize,
} from "./vibe-learning-transcription";
import { yieldEvery, yieldToEventLoop } from "../utils/event-loop-yield";
import {
  assertIndexCreated,
  buildLineStartOffsets,
  parseRipgrepJsonLines,
  readMarkdownLines,
} from "./vibe-learning-resource-read-utils";

const MAX_HIT_CONTEXT_RADIUS = 3;
const MAX_RESOURCE_READ_CHARS = 100 * 1024;
const MAX_GREP_RESULTS = 100;
const GREP_PREVIEW_RADIUS = 80;

// 打包后 rgPath 指向 app.asar 内的 rg.exe，而 spawn 不做 asar 重定向，
// 必须换成 app.asar.unpacked 中的实体文件，否则 grep 会报 spawn ENOENT
const ripgrepBinaryPath = toUnpackedAsarPath(rgPath);

interface EmbeddingSettingConfig {
  id: string;
  providerType?: EmbeddingProviderType;
  source?: "modelscope" | "huggingface";
  apiKey: string;
  baseUrl: string;
  localModelDir?: string;
  batchSize?: number;
  devicePolicy?: "auto" | "cpu" | "cuda";
  currentModel: string;
  models: Array<{
    name: string;
    contextLength: number;
    distance?: number;
  }>;
}

interface EmbeddingConfig {
  providerType: EmbeddingProviderType;
  baseUrl?: string;
  apiKey?: string;
  model: string;
  dimensions: number;
  distance: number;
  batchSize: number;
  devicePolicy: "auto" | "cpu" | "cuda";
  localModelDir?: string;
}

interface SettingForEmbedding {
  embeddingProvider?: {
    currentConfigId?: string;
    configs?: EmbeddingSettingConfig[];
  };
}

interface TranscriptionConfig {
  model: string;
  modelDir: string;
  /** 断句优化模型；未分配时为 null（走句级转录、不做 LLM 优化） */
  llm: LlmRef | null;
}

interface SettingForTranscription extends SettingForLlmSlots {
  transcription?: {
    currentModel?: string;
  };
}

type ImageDescriptionConfig = LlmRef;

interface BilibiliCredentialsConfig {
  SESSDATA?: string;
  bili_jct?: string;
  DedeUserID?: string;
}

const jieba = Jieba.withDict(dict);

type TaskType = "full" | "convert_only" | "index_only" | "embedding_only";
type TaskStatus =
  | "pending"
  | "downloading" // 正在下载远程视频
  | "transcribing" // 正在转录音视频
  | "converting"
  | "optimizing_transcript" // 正在进行转录断句优化
  | "indexing"
  | "embedding"
  | "completed"
  | "failed";

type EmbeddingSwitchReason =
  | "config_switch"
  | "model_switch"
  | "db_switch"
  | "startup_reconcile"
  | "sync_upload_reconnect"
  | "sync_download_reconnect";

const VL_TASK_STALE_ERROR_CODE = "VL_TASK_STALE";

class VibeLearningTaskStaleError extends Error {
  readonly code = VL_TASK_STALE_ERROR_CODE;

  constructor(resourceId: number, taskGeneration: number, currentGeneration: number) {
    super(
      `resource ${resourceId} task stale: taskGeneration=${taskGeneration}, currentGeneration=${currentGeneration}`
    );
    this.name = "VibeLearningTaskStaleError";
  }
}

interface RebuildQueueForEmbeddingSwitchParams {
  dimensions: number;
  mainDbName?: string;
  reason?: EmbeddingSwitchReason;
}

interface RebuildQueueForEmbeddingSwitchResult {
  reinitOk: boolean;
  queued: number;
  droppedPending: number;
  previousGeneration: number;
  currentGeneration: number;
  reason: EmbeddingSwitchReason;
}

interface HandleEmbeddingSwitchByPolicyParams {
  mainDbName: string;
  dimensions: number;
  fingerprintChanged: boolean;
  providerType: EmbeddingProviderType;
  reason: EmbeddingSwitchReason;
}

interface HandleEmbeddingSwitchByPolicyResult {
  reinitOk: boolean;
  queued: number;
  droppedPending: number;
  previousGeneration: number;
  currentGeneration: number;
}

interface RecoverResourcesOptions {
  forceEmbedding?: boolean;
}

interface IndexTask {
  resourceId: number;
  projectId: number;
  mainDbName: string;
  originalPath: string;
  resourceName: string; // 原始文件名
  markdownPath?: string;
  type: TaskType;
  status: TaskStatus;
  retryCount: number;
  generation: number;
  error?: string;
}

type AddTaskResult =
  | { accepted: true; reason: "queued_new" | "updated_pending" }
  | {
      accepted: false;
      reason: "already_running";
      currentStatus: TaskStatus;
    };

class VibeLearningIndexQueue extends EventEmitter implements Module {
  name: string;
  private queue: IndexTask[] = [];
  private activeTaskCount = 0;
  private maxConcurrency = 2;
  private isProcessing = false;
  private queueGeneration = 0;

  // 内存中记录当前正在处理的任务状态
  private processingStatus: Map<number, TaskStatus> = new Map();
  // 记录最近一次“带进度”的状态，用于重启后快照同步
  private taskProgressMap: Map<number, { status: TaskStatus; taskProgress: TaskProgress }> =
    new Map();

  // 缓存 embedding 配置
  private cachedEmbeddingConfig: EmbeddingConfig | null | undefined = undefined;

  // 缓存转译配置
  private cachedTranscriptionConfig: TranscriptionConfig | null | undefined = undefined;

  // 缓存图片描述配置
  private cachedImageDescriptionConfig: ImageDescriptionConfig | null | undefined = undefined;

  private static readonly RECOVER_YIELD_EVERY = 10;

  constructor() {
    super();
    this.name = "vibe-learning-index-queue";
  }

  /**
   * 从 setting.json 读取 embedding 配置
   */
  private async getEmbeddingConfig(): Promise<EmbeddingConfig | null> {
    // 使用缓存避免频繁读取文件
    if (this.cachedEmbeddingConfig !== undefined) {
      return this.cachedEmbeddingConfig;
    }

    try {
      const settingPath = join(PathUtil.getAppDir(), "setting.json");
      const settingContent = await fs.readFile(settingPath, "utf-8");
      const setting: SettingForEmbedding = JSON.parse(settingContent);

      const { embeddingProvider } = setting;
      if (!embeddingProvider || !embeddingProvider.currentConfigId) {
        this.cachedEmbeddingConfig = null;
        return null;
      }

      const { configs, currentConfigId } = embeddingProvider;
      const currentConfig = configs?.find(c => c.id === currentConfigId);

      if (!currentConfig) {
        this.cachedEmbeddingConfig = null;
        return null;
      }

      const {
        apiKey,
        baseUrl,
        currentModel,
        models,
        providerType,
        batchSize,
        devicePolicy,
        localModelDir,
      } = currentConfig;
      const modelConfig = models?.find(m => m.name === currentModel);

      if (!currentModel || !modelConfig) {
        this.cachedEmbeddingConfig = null;
        return null;
      }

      const resolvedProviderType: EmbeddingProviderType =
        providerType === "local_python" || currentConfig.id === LOCAL_EMBEDDING_CONFIG_ID
          ? "local_python"
          : "remote_openai";

      if (resolvedProviderType === "remote_openai" && (!apiKey || !baseUrl)) {
        this.cachedEmbeddingConfig = null;
        return null;
      }

      const distance =
        modelConfig.distance ||
        (resolvedProviderType === "local_python" ? DEFAULT_LOCAL_EMBEDDING_DISTANCE : 0);

      if (distance <= 0) {
        this.cachedEmbeddingConfig = null;
        return null;
      }

      this.cachedEmbeddingConfig = {
        providerType: resolvedProviderType,
        baseUrl,
        apiKey,
        model: currentModel,
        dimensions: modelConfig.contextLength, // contextLength 实际是维度
        distance,
        batchSize: batchSize || 8,
        devicePolicy: devicePolicy || "auto",
        localModelDir: localModelDir || join(app.getPath("userData"), "embedding-models"),
      };

      // 更新 VibeLearningDBManager 的维度配置
      vibeLearningDBManager.setVecDimensions(modelConfig.contextLength);

      log.info(
        `[VibeLearningIndexQueue] Loaded embedding config: model=${currentModel}, dimensions=${modelConfig.contextLength}`
      );

      return this.cachedEmbeddingConfig;
    } catch (error) {
      log.error(`[VibeLearningIndexQueue] Error loading embedding config: ${error}`);
      this.cachedEmbeddingConfig = null;
      return null;
    }
  }

  private async embedTexts(texts: string[], embeddingConfig: EmbeddingConfig): Promise<number[][]> {
    if (!texts.length) {
      return [];
    }

    if (embeddingConfig.providerType === "local_python") {
      const res = await localInference.embedTexts(texts, {
        modelDir: embeddingConfig.localModelDir,
        modelName: embeddingConfig.model,
        batchSize: embeddingConfig.batchSize,
        devicePolicy: embeddingConfig.devicePolicy,
      });

      return res.embeddings || [];
    }

    if (!embeddingConfig.apiKey || !embeddingConfig.baseUrl) {
      throw new Error("远端 embedding 缺少 apiKey 或 baseUrl");
    }

    const client = new OpenAI({
      apiKey: embeddingConfig.apiKey,
      baseURL: embeddingConfig.baseUrl,
    });

    const res = await client.embeddings.create({
      model: embeddingConfig.model,
      input: texts,
      dimensions: embeddingConfig.dimensions,
    });

    return res.data.map(item => item.embedding);
  }

  /**
   * 清除 embedding 配置缓存（配置变更时调用）
   */
  clearEmbeddingConfigCache(): void {
    this.cachedEmbeddingConfig = undefined;
    log.info("[VibeLearningIndexQueue] Cleared embedding config cache");
  }

  /**
   * 从 setting.json 读取转译配置
   */
  private async getTranscriptionConfig(): Promise<TranscriptionConfig | null> {
    // 使用缓存避免频繁读取文件
    if (this.cachedTranscriptionConfig !== undefined) {
      return this.cachedTranscriptionConfig;
    }

    try {
      const settingPath = join(PathUtil.getAppDir(), "setting.json");
      const settingContent = await fs.readFile(settingPath, "utf-8");
      const setting: SettingForTranscription = JSON.parse(settingContent);

      // 提取模型尺寸（"faster-whisper-base" / "whisper-cpp-base" -> "base"）
      const model = normalizeModelSize(setting.transcription?.currentModel);

      // 获取模型目录
      const modelDir = transcriptionModule.getModelsDir();

      // 断句优化模型：分配了「转录断句优化」槽且模型仍在设置里才启用
      const llm = resolveUsageSlot(setting, "transcriptionOptimization");

      this.cachedTranscriptionConfig = { model, modelDir, llm };

      log.info(
        `[VibeLearningIndexQueue] Loaded transcription config: model=${model}, modelDir=${modelDir}, llm=${llm ? `${llm.providerId}/${llm.modelId}` : "none"}`
      );

      return this.cachedTranscriptionConfig;
    } catch (error) {
      log.error(`[VibeLearningIndexQueue] Error loading transcription config: ${error}`);
      this.cachedTranscriptionConfig = null;
      return null;
    }
  }

  /**
   * 清除转译配置缓存（配置变更时调用）
   */
  clearTranscriptionConfigCache(): void {
    this.cachedTranscriptionConfig = undefined;
    log.info("[VibeLearningIndexQueue] Cleared transcription config cache");
  }

  /**
   * 从 setting.json 读取图片描述 LLM 配置
   */
  private async getImageDescriptionConfig(): Promise<ImageDescriptionConfig | null> {
    // 使用缓存避免频繁读取文件
    if (this.cachedImageDescriptionConfig !== undefined) {
      return this.cachedImageDescriptionConfig;
    }

    try {
      const settingPath = join(PathUtil.getAppDir(), "setting.json");
      const settingContent = await fs.readFile(settingPath, "utf-8");
      const setting: SettingForLlmSlots = JSON.parse(settingContent);

      this.cachedImageDescriptionConfig = resolveUsageSlot(setting, "vibeLearningImageDescription");

      log.info(
        `[VibeLearningIndexQueue] Loaded image description config: ${
          this.cachedImageDescriptionConfig
            ? `${this.cachedImageDescriptionConfig.providerId}/${this.cachedImageDescriptionConfig.modelId}`
            : "none"
        }`
      );

      return this.cachedImageDescriptionConfig;
    } catch (error) {
      log.error(`[VibeLearningIndexQueue] Error loading image description config: ${error}`);
      this.cachedImageDescriptionConfig = null;
      return null;
    }
  }

  /**
   * 清除图片描述配置缓存（配置变更时调用）
   */
  clearImageDescriptionConfigCache(): void {
    this.cachedImageDescriptionConfig = undefined;
    log.info("[VibeLearningIndexQueue] Cleared image description config cache");
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

  private isTaskStale(task: Pick<IndexTask, "resourceId" | "generation">): boolean {
    return task.generation !== this.queueGeneration;
  }

  private throwIfTaskStale(
    task: Pick<IndexTask, "resourceId" | "generation">,
    stage: string
  ): void {
    if (!this.isTaskStale(task)) {
      return;
    }

    log.info(
      `[VibeLearningIndexQueue] Skip stale task at ${stage}: resource ${task.resourceId}, task generation ${task.generation}, current generation ${this.queueGeneration}`
    );
    throw new VibeLearningTaskStaleError(task.resourceId, task.generation, this.queueGeneration);
  }

  private isTaskStaleError(error: unknown): boolean {
    if (error instanceof VibeLearningTaskStaleError) {
      return true;
    }

    if (typeof error === "object" && error !== null) {
      return (
        (error as { code?: string }).code === VL_TASK_STALE_ERROR_CODE ||
        (error as { name?: string }).name === "VibeLearningTaskStaleError"
      );
    }

    return false;
  }

  private clearQueueForNewGeneration(): { droppedPending: number } {
    const droppedPending = this.queue.filter(task => task.status === "pending").length;

    this.queue = [];
    this.processingStatus.clear();
    this.taskProgressMap.clear();

    return { droppedPending };
  }

  private getCurrentGenerationQueuedCount(): number {
    return this.queue.filter(task => task.generation === this.queueGeneration).length;
  }

  async rebuildQueueForEmbeddingSwitch(
    params: RebuildQueueForEmbeddingSwitchParams
  ): Promise<RebuildQueueForEmbeddingSwitchResult> {
    const reason = params.reason || "model_switch";
    const targetDimensions = Math.floor(params.dimensions);
    const targetDbName = params.mainDbName || databaseModule.getCurrentDatabaseName();
    const previousGeneration = this.queueGeneration;

    const result = await this.handleEmbeddingSwitchByPolicy({
      mainDbName: targetDbName,
      dimensions: targetDimensions,
      fingerprintChanged: true,
      providerType: "local_python",
      reason,
    });

    return {
      reinitOk: result.reinitOk,
      queued: result.queued,
      droppedPending: result.droppedPending,
      previousGeneration,
      currentGeneration: result.currentGeneration,
      reason,
    };
  }

  /**
   * 立即使当前队列中的所有任务失效，
   * 用于数据库切换时在 orchestrator 链外部快速中止旧任务
   */
  abortCurrentRun(): void {
    this.queueGeneration++;
    const { droppedPending } = this.clearQueueForNewGeneration();
    log.info(
      `[VibeLearningIndexQueue] Abort current run, generation=${this.queueGeneration}, droppedPending=${droppedPending}`
    );
  }

  async handleEmbeddingSwitchByPolicy(
    params: HandleEmbeddingSwitchByPolicyParams
  ): Promise<HandleEmbeddingSwitchByPolicyResult> {
    const previousGeneration = this.queueGeneration;
    this.queueGeneration += 1;
    const currentGeneration = this.queueGeneration;
    const { droppedPending } = this.clearQueueForNewGeneration();

    log.info(
      `[VibeLearningIndexQueue] Handle embedding switch by policy: reason=${params.reason}, provider=${params.providerType}, dimensions=${params.dimensions}, fingerprintChanged=${params.fingerprintChanged}, generation=${previousGeneration}->${currentGeneration}, droppedPending=${droppedPending}`
    );

    if (!Number.isFinite(params.dimensions) || params.dimensions <= 0) {
      log.warn(
        `[VibeLearningIndexQueue] Invalid dimensions for queue rebuild: ${params.dimensions}`
      );
      return {
        reinitOk: false,
        queued: 0,
        droppedPending,
        previousGeneration,
        currentGeneration,
      };
    }

    let reinitOk = true;
    if (params.fingerprintChanged) {
      reinitOk = await this.reinitAllVecTables(Math.floor(params.dimensions), params.mainDbName);
    }

    if (reinitOk) {
      await this.checkAndRecoverResources(params.mainDbName, {
        forceEmbedding: params.fingerprintChanged,
      });
    }

    return {
      reinitOk,
      queued: this.getCurrentGenerationQueuedCount(),
      droppedPending,
      previousGeneration,
      currentGeneration,
    };
  }

  /**
   * 向所有窗口发送消息
   */
  private sendToAllWindows(channel: string, data: unknown): void {
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    });
  }

  /**
   * 发送带进度数据的状态变更事件
   * taskProgress 是通用进度，status 字段标识当前阶段（转录/拆分/索引等）
   */
  private sendStatusWithProgress(
    resourceId: number,
    status: TaskStatus,
    taskProgress?: TaskProgress
  ): void {
    if (taskProgress) {
      this.taskProgressMap.set(resourceId, {
        status,
        taskProgress,
      });
    } else {
      this.taskProgressMap.delete(resourceId);
    }

    this.sendToAllWindows("vibe-learning-status-change", {
      resourceId,
      status,
      taskProgress,
    });
  }

  /**
   * 添加任务到队列
   */
  addTask(task: Omit<IndexTask, "status" | "retryCount" | "generation">): AddTaskResult {
    // 检查是否已存在相同资源的任务
    const existingTask = this.queue.find(t => t.resourceId === task.resourceId);

    if (existingTask) {
      if (existingTask.status !== "pending") {
        log.info(
          `[VibeLearningIndexQueue] Skip duplicate task for running resource ${task.resourceId}, currentStatus=${existingTask.status}`
        );
        return {
          accepted: false,
          reason: "already_running",
          currentStatus: existingTask.status,
        };
      }

      // pending 任务就地更新，避免替换对象导致运行引用错乱
      existingTask.projectId = task.projectId;
      existingTask.mainDbName = task.mainDbName;
      existingTask.originalPath = task.originalPath;
      existingTask.resourceName = task.resourceName;
      existingTask.markdownPath = task.markdownPath;
      existingTask.type = task.type;
      existingTask.retryCount = 0;
      existingTask.error = undefined;
      existingTask.generation = this.queueGeneration;
      existingTask.status = "pending";

      log.info(
        `[VibeLearningIndexQueue] Updated pending task for resource ${task.resourceId}, type: ${task.type}`
      );

      this.processQueue();
      return {
        accepted: true,
        reason: "updated_pending",
      };
    } else {
      const newTask: IndexTask = {
        ...task,
        status: "pending",
        retryCount: 0,
        generation: this.queueGeneration,
      };
      this.queue.push(newTask);

      log.info(
        `[VibeLearningIndexQueue] Added task for resource ${task.resourceId}, type: ${task.type}`
      );

      // 开始处理队列
      this.processQueue();
      return {
        accepted: true,
        reason: "queued_new",
      };
    }
  }

  /**
   * 获取资源的处理状态
   */
  getResourceStatus(resourceId: number): TaskStatus | null {
    return this.processingStatus.get(resourceId) || null;
  }

  getResourceStatuses(
    resourceIds: number[]
  ): Record<number, { status: TaskStatus | null; taskProgress?: TaskProgress }> {
    const result: Record<number, { status: TaskStatus | null; taskProgress?: TaskProgress }> = {};

    for (const resourceId of resourceIds) {
      const status = this.getResourceStatus(resourceId);
      const progressEntry = this.taskProgressMap.get(resourceId);
      result[resourceId] = {
        status,
        ...(status && progressEntry && progressEntry.status === status && progressEntry.taskProgress
          ? { taskProgress: progressEntry.taskProgress }
          : {}),
      };
    }

    return result;
  }

  /**
   * 获取队列状态
   */
  getQueueStatus(): { pending: number; processing: number } {
    const pending = this.queue.filter(t => t.status === "pending").length;
    const processing = this.activeTaskCount;
    return { pending, processing };
  }

  /**
   * 开始处理队列
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.queue.length > 0 && this.activeTaskCount < this.maxConcurrency) {
        const task = this.queue.find(t => t.status === "pending");
        if (!task) break;

        task.status = "converting";
        this.activeTaskCount++;

        // 异步处理任务
        this.processTask(task)
          .catch(error => {
            log.error(
              `[VibeLearningIndexQueue] Task failed for resource ${task.resourceId}: ${error}`
            );
          })
          .finally(() => {
            this.activeTaskCount--;
            // 从队列中移除已完成的任务
            const index = this.queue.indexOf(task);
            if (index >= 0) {
              this.queue.splice(index, 1);
            }
            // 继续处理队列
            this.processQueue();
          });
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 处理单个任务
   */
  private async processTask(task: IndexTask): Promise<void> {
    const { resourceId, projectId, mainDbName, originalPath, resourceName, type } = task;

    try {
      let markdownContent: string | null = null;
      let markdownPath = task.markdownPath;

      this.throwIfTaskStale(task, "task_start");

      // 获取资源信息以检查 sourceType
      const db = databaseModule.getDatabase(mainDbName);
      const resource = db ? VibeLearningResourceTable.getResourceById(db, resourceId) : null;
      const sourceType = resource?.sourceType;
      const sourceMetaInfo = resource?.sourceMetaInfo;

      // 转换阶段
      if (type === "full" || type === "convert_only") {
        // 检查是否是来自笔记的资源
        if (sourceType === "note" && sourceMetaInfo) {
          markdownContent = await this.processNoteResource(resourceId, sourceMetaInfo, mainDbName);
        } else if (sourceType === "bilibili" && sourceMetaInfo) {
          // Bilibili 视频
          markdownContent = await this.processBilibiliVideo(
            resourceId,
            sourceMetaInfo,
            resourceName,
            mainDbName
          );
        } else if (sourceType === "youtube" && sourceMetaInfo) {
          // YouTube 视频
          markdownContent = await this.processYoutubeVideo(
            resourceId,
            sourceMetaInfo,
            resourceName,
            mainDbName,
            originalPath
          );
        } else {
          // 普通资源处理流程
          log.info(`[VibeLearningIndexQueue] Converting resource ${resourceId}`);

          // 如果是远程 URL，先下载到本地
          let localFilePath = originalPath;
          let needCleanup = false;

          if (this.isRemoteUrl(originalPath)) {
            this.processingStatus.set(resourceId, "downloading");
            this.emit("status-change", resourceId, "downloading");
            log.info(`[VibeLearningIndexQueue] Downloading remote file: ${originalPath}`);
            localFilePath = await this.downloadRemoteFile(originalPath);
            needCleanup = true;
            log.info(`[VibeLearningIndexQueue] Downloaded to: ${localFilePath}`);
          } else if (localFilePath.startsWith("~")) {
            localFilePath = localFilePath.replace(/^~/, os.homedir());
            log.info(`[VibeLearningIndexQueue] Expanded ~ path to: ${localFilePath}`);
          }

          try {
            // 检查是否为媒体文件（视频/音频），走统一媒体处理管线
            if (this.isMediaFile(localFilePath)) {
              const sourceStableId = await this.buildSourceStableId(originalPath, localFilePath);
              markdownContent = await this.processMediaResource(
                localFilePath,
                resourceId,
                resourceName,
                mainDbName,
                sourceStableId
              );
            } else {
              // 非媒体文件走 MarkItDown（PDF、Word、PPT 等）
              this.processingStatus.set(resourceId, "converting");
              this.emit("status-change", resourceId, "converting");

              const imageDescConfig = await this.getImageDescriptionConfig();

              const result = await markitdownModule.convertFile({
                filePath: localFilePath,
                fileName: originalPath.split("/").pop() || "file",
                imageLlm: imageDescConfig,
              });

              if (!result.success || !result.textContent) {
                throw new Error(result.error || "Conversion failed");
              }

              markdownContent = result.textContent;
            }
          } finally {
            // 清理临时下载的文件
            if (needCleanup) {
              try {
                await fs.unlink(localFilePath);
                log.info(`[VibeLearningIndexQueue] Cleaned up temp file: ${localFilePath}`);
              } catch (e) {
                log.warn(`[VibeLearningIndexQueue] Failed to cleanup temp file: ${e}`);
              }
            }
          }
        }

        // 始终保存完整 Markdown；长文档不再经过 LLM 分章/摘要。
        markdownPath = await this.saveMarkdown(
          mainDbName,
          projectId,
          resourceId,
          resourceName,
          markdownContent
        );

        log.info(
          `[VibeLearningIndexQueue] Saved markdown for resource ${resourceId}: ${markdownPath}`
        );

        // 更新数据库中的 markdown_path
        await this.updateResourceMarkdownPath(mainDbName, resourceId, markdownPath);
        log.info(
          `[VibeLearningIndexQueue] Updated markdown path in database for resource ${resourceId}`
        );
      }

      // 索引阶段
      if (type === "full" || type === "index_only") {
        this.throwIfTaskStale(task, "before_indexing");
        this.processingStatus.set(resourceId, "indexing");
        this.emit("status-change", resourceId, "indexing");

        log.info(`[VibeLearningIndexQueue] Indexing resource ${resourceId}`);

        if (!markdownContent && markdownPath) {
          const absolutePath = this.getAbsoluteMarkdownPath(markdownPath);
          markdownContent = await fs.readFile(absolutePath, "utf-8");
        }

        if (!markdownContent) {
          throw new Error("No markdown content to index");
        }

        await this.createIndex(mainDbName, projectId, resourceId, markdownContent, task);

        log.info(`[VibeLearningIndexQueue] Indexed resource ${resourceId}`);
      }

      // 仅 embedding 阶段（已有 FTS 索引但缺少向量索引）
      if (type === "embedding_only") {
        this.throwIfTaskStale(task, "before_embedding");
        this.processingStatus.set(resourceId, "embedding");
        this.emit("status-change", resourceId, "embedding");

        log.info(`[VibeLearningIndexQueue] Generating embedding for resource ${resourceId}`);

        // 从文件读取 markdown 内容
        if (!markdownContent && markdownPath) {
          const absolutePath = this.getAbsoluteMarkdownPath(markdownPath);
          markdownContent = await fs.readFile(absolutePath, "utf-8");
        }

        if (!markdownContent) {
          throw new Error("No markdown content for embedding");
        }

        // 仅生成 embedding
        await this.createEmbeddingOnly(mainDbName, projectId, resourceId, markdownContent, task);

        log.info(`[VibeLearningIndexQueue] Generated embedding for resource ${resourceId}`);
      }

      // 完成
      this.processingStatus.delete(resourceId);
      this.taskProgressMap.delete(resourceId);
      this.emit("status-change", resourceId, "completed");

      // 通知前端资源已更新，需要刷新资源列表
      this.sendToAllWindows("vibe-learning-resource-updated", {
        resourceId,
        projectId,
        mainDbName,
      });

      log.info(`[VibeLearningIndexQueue] Completed task for resource ${resourceId}`);
    } catch (error) {
      if (this.isTaskStaleError(error)) {
        this.processingStatus.delete(resourceId);
        this.taskProgressMap.delete(resourceId);
        return;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);

      // 重试逻辑
      if (task.retryCount < 2) {
        task.retryCount++;
        task.status = "pending";
        log.warn(
          `[VibeLearningIndexQueue] Retrying task for resource ${resourceId}, attempt ${task.retryCount}`
        );
        return;
      }

      // 标记为失败
      this.processingStatus.set(resourceId, "failed");
      this.taskProgressMap.delete(resourceId);
      this.emit("status-change", resourceId, "failed", errorMessage);

      log.error(`[VibeLearningIndexQueue] Task failed for resource ${resourceId}: ${errorMessage}`);
    }
  }

  private async processNoteResource(
    resourceId: number,
    sourceMetaInfo: string,
    mainDbName: string
  ): Promise<string> {
    // 解析来源元信息
    let meta: NoteSourceMeta;
    try {
      meta = JSON.parse(sourceMetaInfo) as NoteSourceMeta;
    } catch (e) {
      throw new Error("无效的笔记资源元信息");
    }

    const { contentId, title, type } = meta;
    log.info(
      `[VibeLearningIndexQueue] Processing note resource: contentId=${contentId}, type=${type}, title=${title}`
    );

    this.processingStatus.set(resourceId, "converting");
    this.emit("status-change", resourceId, "converting");

    // 从数据库获取内容
    const db = databaseModule.getDatabase(mainDbName);
    if (!db) {
      throw new Error("数据库连接不存在");
    }

    const content = ContentTable.getContentById(db, contentId);
    if (!content) {
      throw new Error(`未找到内容 ID: ${contentId}`);
    }

    // 将 Slate 内容转换为 Markdown
    const markdown = getMarkdown(content.content);

    if (!markdown || markdown.trim().length === 0) {
      throw new Error("笔记内容为空");
    }

    log.info(
      `[VibeLearningIndexQueue] Note resource processed successfully: resourceId=${resourceId}, contentLength=${markdown.length}`
    );

    return markdown;
  }

  /**
   * 处理 Bilibili 视频：下载视频，然后走统一媒体处理管线
   */
  private async processBilibiliVideo(
    resourceId: number,
    sourceMetaInfo: string,
    resourceName: string,
    mainDbName: string
  ): Promise<string> {
    // 解析来源元信息
    let meta: BilibiliSourceMeta;
    try {
      meta = JSON.parse(sourceMetaInfo) as BilibiliSourceMeta;
    } catch (e) {
      throw new Error("无效的 Bilibili 视频元信息");
    }

    const { bvid, cid, quality, title } = meta;
    log.info(
      `[VibeLearningIndexQueue] Processing Bilibili video: ${bvid}-${cid}, quality: ${quality}`
    );
    const credentials = await this.getBilibiliCredentials();

    // 1. 获取本地视频文件路径（检查缓存或下载）
    let localVideoPath: string | null = null;
    const cacheStatus = await getBilibiliCacheStatus(bvid, cid, quality);

    if (cacheStatus?.localPath) {
      log.info(`[VibeLearningIndexQueue] Using cached video: ${cacheStatus.localPath}`);
      localVideoPath = cacheStatus.localPath;
    } else {
      // 下载视频
      this.processingStatus.set(resourceId, "downloading");
      this.emit("status-change", resourceId, "downloading");

      log.info(`[VibeLearningIndexQueue] Downloading Bilibili video...`);

      const playUrl = await this.getBilibiliPlayUrl(bvid, cid, quality, credentials);
      if (!playUrl) {
        throw new Error("无法获取视频播放地址");
      }

      const cacheResult = await cacheBilibiliVideo({
        videoUrl: playUrl.video,
        audioUrl: playUrl.audio,
        bvid,
        cid,
        quality,
        title: title || resourceName,
      });

      localVideoPath = cacheResult.localPath;
      log.info(`[VibeLearningIndexQueue] Video downloaded to: ${localVideoPath}`);
    }

    // 2. 走统一媒体处理管线
    return this.processMediaResource(
      localVideoPath,
      resourceId,
      title || resourceName,
      mainDbName,
      `bilibili:${bvid}:${cid}:${quality}`,
      `https://www.bilibili.com/video/${bvid}`
    );
  }

  /**
   * 处理 YouTube 视频：下载视频，然后走统一媒体处理管线
   */
  private async processYoutubeVideo(
    resourceId: number,
    sourceMetaInfo: string,
    resourceName: string,
    mainDbName: string,
    fallbackUrl?: string
  ): Promise<string> {
    let meta: YoutubeSourceMeta;
    try {
      meta = JSON.parse(sourceMetaInfo) as YoutubeSourceMeta;
    } catch {
      throw new Error("无效的 YouTube 视频元信息");
    }

    const sourceUrl = (meta.url || fallbackUrl || "").trim();
    if (!sourceUrl) {
      throw new Error("无效的 YouTube 视频链接");
    }

    log.info(`[VibeLearningIndexQueue] Processing YouTube video: ${sourceUrl}`);
    const proxy = await this.getYoutubeProxy();

    let localVideoPath: string | null = null;
    const cacheStatus = await getYoutubeCacheStatus(sourceUrl);

    if (cacheStatus?.localPath) {
      log.info(`[VibeLearningIndexQueue] Using cached YouTube video: ${cacheStatus.localPath}`);
      localVideoPath = cacheStatus.localPath;
    } else {
      this.processingStatus.set(resourceId, "downloading");
      this.emit("status-change", resourceId, "downloading");
      log.info(`[VibeLearningIndexQueue] Downloading YouTube video...`);

      const info = await YtDlpService.fetchVideoInfo(sourceUrl, proxy);
      if (!info.videoStreams?.length || !info.audioStreams?.length) {
        throw new Error("未找到可用的 YouTube 音视频流");
      }

      const videoStream = this.selectYoutubeVideoStream(info.videoStreams, meta.videoStream);
      const audioStream = this.selectYoutubeAudioStream(info.audioStreams, meta.audioStream);
      if (!videoStream || !audioStream) {
        throw new Error("无法选择可用的 YouTube 音视频流");
      }

      const cacheResult = await cacheYoutubeVideo({
        url: sourceUrl,
        videoStream,
        audioStream,
        proxy,
      });
      localVideoPath = cacheResult.localPath;
      log.info(`[VibeLearningIndexQueue] YouTube video downloaded to: ${localVideoPath}`);
    }

    return this.processMediaResource(
      localVideoPath,
      resourceId,
      meta.title || resourceName,
      mainDbName,
      `youtube:${sourceUrl}`,
      sourceUrl
    );
  }

  private async getBilibiliCredentials(): Promise<BilibiliCredentialsConfig> {
    try {
      const settingPath = join(PathUtil.getAppDir(), "setting.json");
      const settingContent = await fs.readFile(settingPath, "utf-8");
      const setting = JSON.parse(settingContent) as {
        integration?: {
          bilibili?: { credentials?: BilibiliCredentialsConfig };
        };
      };
      return setting.integration?.bilibili?.credentials || {};
    } catch (error) {
      log.warn(`[VibeLearningIndexQueue] Failed to read Bilibili credentials: ${error}`);
      return {};
    }
  }

  private selectYoutubeVideoStream(
    streams: StreamOption[],
    preferredId?: string
  ): StreamOption | null {
    if (preferredId) {
      const matched = streams.find(stream => stream.id === preferredId);
      if (matched) {
        return matched;
      }
    }

    const getResolution = (resolution?: string): number => {
      const match = resolution?.match(/(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    };

    const sorted = [...streams].sort((a, b) => {
      const resolutionDiff = getResolution(b.resolution) - getResolution(a.resolution);
      if (resolutionDiff !== 0) return resolutionDiff;
      const fpsDiff = (b.fps || 0) - (a.fps || 0);
      if (fpsDiff !== 0) return fpsDiff;
      return (b.bitrate || 0) - (a.bitrate || 0);
    });

    return sorted[0] || null;
  }

  private selectYoutubeAudioStream(
    streams: StreamOption[],
    preferredId?: string
  ): StreamOption | null {
    if (preferredId) {
      const matched = streams.find(stream => stream.id === preferredId);
      if (matched) {
        return matched;
      }
    }

    const sorted = [...streams].sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
    return sorted[0] || null;
  }

  private async getYoutubeProxy(): Promise<string | undefined> {
    try {
      const settingPath = join(PathUtil.getAppDir(), "setting.json");
      const settingContent = await fs.readFile(settingPath, "utf-8");
      const setting = JSON.parse(settingContent) as {
        integration?: { youtube?: { proxy?: string } };
      };
      const proxy = setting.integration?.youtube?.proxy?.trim();
      return proxy ? proxy : undefined;
    } catch (error) {
      log.warn(`[VibeLearningIndexQueue] Failed to read YouTube proxy settings: ${error}`);
      return undefined;
    }
  }

  /**
   * 获取 Bilibili 视频播放地址
   */
  private async getBilibiliPlayUrl(
    bvid: string,
    cid: string,
    quality: number,
    credentials: BilibiliCredentialsConfig
  ): Promise<{ video: string; audio: string } | null> {
    try {
      const params = new URLSearchParams({
        bvid,
        cid,
        qn: String(quality),
        fnval: "4048", // 获取 DASH 格式
        fourk: "1",
      });

      const headers: Record<string, string> = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: `https://www.bilibili.com/video/${bvid}`,
      };

      if (credentials.SESSDATA) {
        headers.Cookie = `SESSDATA=${credentials.SESSDATA}`;
        if (credentials.bili_jct) {
          headers.Cookie += `; bili_jct=${credentials.bili_jct}`;
        }
        if (credentials.DedeUserID) {
          headers.Cookie += `; DedeUserID=${credentials.DedeUserID}`;
        }
      }

      const response = await fetch(
        `https://api.bilibili.com/x/player/wbi/playurl?${params.toString()}`,
        { headers }
      );

      const data = (await response.json()) as {
        code: number;
        data?: {
          dash?: {
            video: Array<{ baseUrl: string; bandwidth: number }>;
            audio: Array<{ baseUrl: string; bandwidth: number }>;
          };
        };
      };

      if (data.code !== 0 || !data.data?.dash) {
        log.error(`[VibeLearningIndexQueue] Failed to get play URL: ${JSON.stringify(data)}`);
        return null;
      }

      const { video, audio } = data.data.dash;

      // 选择最高质量的视频和音频流
      const videoStream = video.sort((a, b) => b.bandwidth - a.bandwidth)[0];
      const audioStream = audio.sort((a, b) => b.bandwidth - a.bandwidth)[0];

      if (!videoStream || !audioStream) {
        return null;
      }

      return {
        video: videoStream.baseUrl,
        audio: audioStream.baseUrl,
      };
    } catch (error) {
      log.error(`[VibeLearningIndexQueue] Error getting play URL: ${error}`);
      return null;
    }
  }

  /**
   * 将转录 segments 格式化为带时间戳的 Markdown
   */
  private formatSegmentsToMarkdown(
    title: string,
    segments: Array<{ text: string; start: number; end: number }>,
    videoUrl?: string
  ): string {
    const lines: string[] = [];

    lines.push(`# ${title}`);
    lines.push("");
    if (videoUrl) {
      lines.push(`> 视频: ${videoUrl}`);
      lines.push("");
    }
    lines.push("## 转录内容");
    lines.push("");

    for (const segment of segments) {
      const time = this.formatTimestamp(segment.start);
      lines.push(`**[${time}]** ${segment.text}`);
      lines.push("");
    }

    return lines.join("\n");
  }

  private formatTimestamp(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  // ============================================================
  // 统一媒体处理管线
  // ============================================================

  /**
   * 解析 LLM 输出的 "MM:SS.mmm:文本" 格式为 segments
   */
  private parseTranscriptLines(output: string): Array<{ text: string; start: number }> {
    return output
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        const match = line.match(/^(\d+):([0-5]\d)\.(\d{3}):(.+)$/);
        if (!match) return null;
        const start = parseInt(match[1]) * 60000 + parseInt(match[2]) * 1000 + parseInt(match[3]);
        return { text: match[4].trim(), start };
      })
      .filter((item): item is { text: string; start: number } => item !== null);
  }

  private getOptimizationSegmentTextLength(segment: { text: string; start: number }): number {
    const totalSeconds = Math.floor(segment.start / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = segment.start % 1000;
    const timestamp = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
    return timestamp.length + segment.text.length + 2;
  }

  private splitWordSegmentsForOptimization(
    wordSegments: Array<{ text: string; start: number; end: number }>,
    chunkMaxChars: number,
    overlapWords: number
  ): Array<Array<{ text: string; start: number; end: number }>> {
    if (wordSegments.length === 0) {
      return [];
    }

    const chunks: Array<Array<{ text: string; start: number; end: number }>> = [];
    let startIndex = 0;

    while (startIndex < wordSegments.length) {
      let endIndex = startIndex;
      let chunkChars = 0;

      while (endIndex < wordSegments.length) {
        const segment = wordSegments[endIndex];
        const segmentLength = this.getOptimizationSegmentTextLength(segment);

        if (endIndex > startIndex && chunkChars + segmentLength > chunkMaxChars) {
          break;
        }

        chunkChars += segmentLength;
        endIndex++;

        if (chunkChars >= chunkMaxChars) {
          break;
        }
      }

      if (endIndex === startIndex) {
        endIndex = Math.min(startIndex + 1, wordSegments.length);
      }

      chunks.push(wordSegments.slice(startIndex, endIndex));

      if (endIndex >= wordSegments.length) {
        break;
      }

      const nextStartIndex = Math.max(0, endIndex - overlapWords);
      startIndex = nextStartIndex > startIndex ? nextStartIndex : endIndex;
    }

    return chunks;
  }

  private mergeOptimizedChunks(
    parsedChunks: Array<Array<{ text: string; start: number }>>,
    maxEnd: number
  ): Array<{ text: string; start: number; end: number }> {
    const deduped: Array<{ text: string; start: number }> = [];
    const seen = new Set<string>();

    for (const chunk of parsedChunks) {
      for (const item of chunk) {
        const key = `${item.start}|${item.text}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        deduped.push(item);
      }
    }

    deduped.sort((a, b) => a.start - b.start);

    const result: Array<{ text: string; start: number; end: number }> = [];
    for (let i = 0; i < deduped.length; i++) {
      const end = i < deduped.length - 1 ? deduped[i + 1].start - 1 : maxEnd;
      result.push({
        text: deduped[i].text,
        start: deduped[i].start,
        end,
      });
    }

    return result;
  }

  /**
   * 使用 LLM 优化转录文本（字幕断句，复用 VideoNoteView 的 prompt）
   */
  private async optimizeTranscriptionWithLLM(
    wordSegments: Array<{ text: string; start: number; end: number }>,
    language: string,
    config: {
      llm: LlmRef;
      /** 用量归属：资源所在知识库与资源 id */
      library: string;
      entityId: string;
    },
    onProgress?: (progress: TaskProgress) => void
  ): Promise<Array<{ text: string; start: number; end: number }>> {
    const chunkMaxChars = 18_000;
    const overlapWords = 80;
    const maxAttempts = 2;

    log.info(
      `[VibeLearningIndexQueue] Optimizing transcription with LLM: ${wordSegments.length} word segments`
    );

    try {
      const chunks = this.splitWordSegmentsForOptimization(
        wordSegments,
        chunkMaxChars,
        overlapWords
      );
      log.info(
        `[VibeLearningIndexQueue] Transcription optimization split into ${chunks.length} chunks (chunkMaxChars=${chunkMaxChars}, overlapWords=${overlapWords})`
      );

      if (chunks.length === 0) {
        throw new Error("无可用词级时间戳，无法进行断句优化");
      }

      let completed = 0;
      let failed = 0;
      let inProgress = 0;
      const reportProgress = () => {
        const progress: TaskProgress = {
          total: chunks.length,
          completed,
          failed,
          inProgress,
        };
        onProgress?.(progress);
        const percent =
          chunks.length > 0 ? Math.floor(((completed + failed) / chunks.length) * 100) : 100;
        log.info(
          `[VibeLearningIndexQueue] Transcription optimization progress snapshot: ${percent}% (completed=${completed}, failed=${failed}, inProgress=${inProgress}, total=${chunks.length})`
        );
      };

      reportProgress();

      const parsedChunks: Array<Array<{ text: string; start: number }>> = [];

      // 顺序处理，避免同一资源并发大请求导致超时叠加
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkStartTime = Date.now();
        inProgress = 1;
        reportProgress();

        const userPrompt = buildTranscriptionOptimizationUserPrompt(chunk, language);

        // 模型特殊处理
        const modelId = config.llm.modelId;
        const isKimiModel = modelId.startsWith("kimi");
        const noTemperature = ["o1", "o3", "o4", "gpt-5"].some(p => modelId.startsWith(p));

        let parsedChunk: Array<{ text: string; start: number }> | null = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            log.info(
              `[VibeLearningIndexQueue] Optimizing chunk ${i + 1}/${chunks.length}, attempt=${attempt}, segments=${chunk.length}`
            );
            // 断句是机械任务：关推理省 token；kimi 官方推荐 0.6，o 系 / gpt-5 不接受 temperature
            const result = await PiAiRuntimeModule.complete({
              providerId: config.llm.providerId,
              modelId: config.llm.modelId,
              system: TRANSCRIPTION_OPTIMIZATION_SYSTEM_PROMPT,
              messages: [{ role: "user", content: userPrompt }],
              thinking: "off",
              ...(isKimiModel ? { temperature: 0.6 } : noTemperature ? {} : { temperature: 0.3 }),
              source: {
                feature: "transcriptionOptimization",
                library: config.library,
                entityId: config.entityId,
              },
            });
            if (!result.ok) throw new Error(result.error ?? "模型请求失败");
            const parsed = this.parseTranscriptLines(result.text);

            if (parsed.length === 0) {
              throw new Error("LLM 断句输出为空或无法解析");
            }

            parsedChunk = parsed;
            break;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log.warn(
              `[VibeLearningIndexQueue] Chunk ${i + 1}/${chunks.length} attempt ${attempt} failed: ${errorMessage}`
            );
            if (attempt >= maxAttempts) {
              failed++;
              inProgress = 0;
              reportProgress();
              throw new Error(
                `断句优化失败（chunk ${i + 1}/${chunks.length}，重试 1 次后仍失败）：${errorMessage}`
              );
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        if (!parsedChunk) {
          throw new Error(`断句优化失败（chunk ${i + 1}/${chunks.length}）`);
        }

        completed++;
        inProgress = 0;
        parsedChunks.push(parsedChunk);
        const chunkElapsedMs = Date.now() - chunkStartTime;
        log.info(
          `[VibeLearningIndexQueue] Chunk ${i + 1}/${chunks.length} complete in ${chunkElapsedMs}ms, sentences=${parsedChunk.length}`
        );
        reportProgress();
      }

      // 计算 end 时间：下一句的 start - 1ms，最后一句用词级 segments 的最大 end
      const maxEnd = wordSegments.length > 0 ? wordSegments[wordSegments.length - 1].end : 5000;

      const result = this.mergeOptimizedChunks(parsedChunks, maxEnd);

      if (result.length === 0) {
        throw new Error("LLM 转录优化结果为空");
      }

      log.info(
        `[VibeLearningIndexQueue] Transcription optimization complete: ${result.length} sentences`
      );

      return result;
    } catch (error) {
      log.error(`[VibeLearningIndexQueue] Error optimizing transcription: ${error}`);
      throw error;
    }
  }

  /**
   * 统一媒体处理管线
   * 所有视频/音频资源（Bilibili、本地、远程等）获取到本地文件后统一走此方法
   */
  private async processMediaResource(
    localFilePath: string,
    resourceId: number,
    resourceName: string,
    mainDbName: string,
    sourceStableId: string,
    videoUrl?: string
  ): Promise<string> {
    const isAudioResource = this.isAudioFile(localFilePath);
    let audioPath = localFilePath;
    let tempAudioPath: string | null = null;

    const mediaFingerprint = await vibeLearningMediaCache
      .computeMediaFingerprint(localFilePath, sourceStableId)
      .catch(error => {
        log.warn(
          `[VibeLearningIndexQueue] Failed to compute media fingerprint, fallback to path hash: ${error}`
        );
        return `fallback:${hashString(localFilePath)}`;
      });

    // 1. 提取音频（仅视频需要）
    this.processingStatus.set(resourceId, "converting");
    this.emit("status-change", resourceId, "converting");

    if (!isAudioResource) {
      const audioKey = vibeLearningMediaCache.buildAudioKey({
        sourceStableId,
        mediaFingerprint,
      });
      const cachedAudioPath = await vibeLearningMediaCache.getAudioPath(audioKey);

      if (cachedAudioPath) {
        audioPath = cachedAudioPath;
        log.info(`[VibeLearningIndexQueue] Hit audio cache for resource ${resourceId}`);
      } else {
        const audioResult = await transcriptionModule.extractAudioFromVideo(localFilePath);
        if (!audioResult.success || !audioResult.audioPath) {
          throw new Error(audioResult.error || "提取音频失败");
        }

        tempAudioPath = audioResult.audioPath;
        audioPath = tempAudioPath;

        try {
          audioPath = await vibeLearningMediaCache.cacheAudioFromFile(audioKey, tempAudioPath);
          log.info(`[VibeLearningIndexQueue] Stored audio cache for resource ${resourceId}`);
        } catch (error) {
          log.warn(
            `[VibeLearningIndexQueue] Failed to cache extracted audio, fallback to temp file: ${error}`
          );
        }
      }
    }

    try {
      // 2. 转录
      this.processingStatus.set(resourceId, "transcribing");
      this.emit("status-change", resourceId, "transcribing");

      const transcriptionConfig = await this.getTranscriptionConfig();
      const optimizationLlm = transcriptionConfig?.llm ?? null;
      const hasLLMConfig = optimizationLlm !== null;

      const modelSize: VLTranscriptionModelSize =
        (transcriptionConfig?.model as VLTranscriptionModelSize) || "base";
      const transcriptionOptions = buildVLTranscriptionOptions(modelSize, hasLLMConfig);
      const { language, sentenceLevel, useLLMOptimization } = transcriptionOptions;

      log.info(
        `[VibeLearningIndexQueue] Transcribing media: model=${modelSize}, hasLLM=${hasLLMConfig}`
      );

      const transcriptionKey = vibeLearningMediaCache.buildTranscriptionKey({
        sourceStableId,
        mediaFingerprint,
        modelSize,
        language,
        sentenceLevel,
        useLLMOptimization,
      });

      let transcriptionData =
        await vibeLearningMediaCache.readTranscription<TranscriptionResult>(transcriptionKey);

      if (transcriptionData) {
        log.info(`[VibeLearningIndexQueue] Hit transcription cache for resource ${resourceId}`);
      } else {
        const transcriptionResult = await transcriptionModule.transcribeAudio(
          audioPath,
          transcriptionOptions,
          (msg: string) => {
            const match = msg.match(/(\d+)%/);
            if (match) {
              this.sendStatusWithProgress(resourceId, "transcribing", {
                total: 100,
                completed: parseInt(match[1]),
                failed: 0,
                inProgress: 1,
              });
            }
          }
        );

        if (!transcriptionResult.success || !transcriptionResult.data) {
          throw new Error(transcriptionResult.error || "转录失败");
        }
        transcriptionData = transcriptionResult.data;

        try {
          await vibeLearningMediaCache.writeTranscription(transcriptionKey, transcriptionData);
        } catch (error) {
          log.warn(`[VibeLearningIndexQueue] Failed to write transcription cache: ${error}`);
        }
      }

      // 3. LLM 优化（如果配置了）
      const { text, segments, wordSegments } = transcriptionData;
      const rawSegments = wordSegments || segments || [];
      const optimizationLanguage = resolveVLOptimizationLanguage(transcriptionData.language);

      const db = databaseModule.getDatabase(mainDbName);
      if (db && rawSegments.length > 0) {
        VibeLearningResourceTable.updateTranscriptSegments(db, resourceId, rawSegments);
      }

      let finalSegments: Array<{
        text: string;
        start: number;
        end: number;
      }>;

      if (optimizationLlm) {
        if (rawSegments.length === 0) {
          throw new Error("无可用词级时间戳，无法进行断句优化");
        }

        const optimizationKey = vibeLearningMediaCache.buildOptimizationKey({
          transcriptionKey,
          llmProvider: optimizationLlm.providerId,
          llmModel: optimizationLlm.modelId,
          llmBaseUrl: "",
          promptHash: hashString(TRANSCRIPTION_OPTIMIZATION_SYSTEM_PROMPT),
          wordSegmentsHash: hashPayload({ rawSegments }),
        });

        const cachedOptimized =
          await vibeLearningMediaCache.readOptimization<
            Array<{ text: string; start: number; end: number }>
          >(optimizationKey);

        if (cachedOptimized) {
          finalSegments = cachedOptimized;
          this.processingStatus.set(resourceId, "optimizing_transcript");
          this.emit("status-change", resourceId, "optimizing_transcript");
          log.info(`[VibeLearningIndexQueue] Hit optimization cache for resource ${resourceId}`);
        } else {
          this.processingStatus.set(resourceId, "optimizing_transcript");
          this.emit("status-change", resourceId, "optimizing_transcript");

          finalSegments = await this.optimizeTranscriptionWithLLM(
            rawSegments,
            optimizationLanguage,
            { llm: optimizationLlm, library: mainDbName, entityId: String(resourceId) },
            progress => {
              this.sendStatusWithProgress(resourceId, "optimizing_transcript", progress);
            }
          );

          try {
            await vibeLearningMediaCache.writeOptimization(optimizationKey, finalSegments);
          } catch (error) {
            log.warn(`[VibeLearningIndexQueue] Failed to write optimization cache: ${error}`);
          }
        }
      } else {
        finalSegments = segments || rawSegments;
      }

      // 4. 保存 segments 到 DB
      if (db && finalSegments.length > 0) {
        VibeLearningResourceTable.updateTranscriptSegments(db, resourceId, finalSegments);
      }

      // 5. 生成带时间戳的 Markdown
      if (finalSegments.length > 0) {
        return this.formatSegmentsToMarkdown(resourceName, finalSegments, videoUrl);
      }

      // 降级：如果完全没有 segments，使用纯文本
      const lines = [`# ${resourceName}`, ""];
      if (videoUrl) lines.push(`> 视频: ${videoUrl}`, "");
      lines.push("## 转录内容", "", text || "（转录内容为空）");
      return lines.join("\n");
    } finally {
      // 清理临时音频文件
      if (tempAudioPath) {
        try {
          await fs.unlink(tempAudioPath);
        } catch (e) {
          log.warn(`[VibeLearningIndexQueue] Failed to cleanup audio file: ${e}`);
        }
      }
    }
  }

  private async saveMarkdown(
    mainDbName: string,
    projectId: number,
    resourceId: number,
    resourceName: string,
    content: string
  ): Promise<string> {
    const dbNameWithoutExt = mainDbName.replace(/\.db$/, "");
    const baseName = this.getBaseFileName(resourceName);
    const safeBaseName = this.sanitizeFileName(baseName);
    const fileName = `${safeBaseName}-${resourceId}.md`;
    const relativePath = `vibe-learning/${dbNameWithoutExt}/${projectId}/${fileName}`;
    const absolutePath = this.getAbsoluteMarkdownPath(relativePath);

    // 确保目录存在
    await fs.mkdir(dirname(absolutePath), { recursive: true });

    // 写入文件
    await fs.writeFile(absolutePath, content, "utf-8");

    return relativePath;
  }

  private getBaseFileName(fileName: string): string {
    const lastDotIndex = fileName.lastIndexOf(".");
    if (lastDotIndex === -1 || lastDotIndex === 0) {
      return fileName;
    }
    return fileName.substring(0, lastDotIndex);
  }

  private sanitizeFileName(fileName: string): string {
    // 替换文件系统中不允许的字符
    return fileName.replace(/[<>:"/\\|?*]/g, "_").trim();
  }

  private getAbsoluteMarkdownPath(relativePath: string): string {
    const appDir = PathUtil.getAppDir();
    return join(appDir, relativePath);
  }

  private async updateResourceMarkdownPath(
    mainDbName: string,
    resourceId: number,
    markdownPath: string
  ): Promise<void> {
    const db = databaseModule.getDatabase(mainDbName);

    if (!db) {
      throw new Error("Database not found");
    }

    VibeLearningResourceTable.updateMarkdownPath(db, resourceId, markdownPath);
  }

  private async createIndex(
    mainDbName: string,
    projectId: number,
    resourceId: number,
    content: string,
    task?: Pick<IndexTask, "resourceId" | "generation">
  ): Promise<void> {
    if (task) {
      this.throwIfTaskStale(task, "create_index_start");
    }

    const chunks = smartChunkWithRanges(content, {
      minLength: 1000,
      maxLength: 2000,
      overlap: 0,
      splitter: "sentence",
    });

    const embeddingConfig = await this.getEmbeddingConfig();

    const processedChunks: Array<{
      text: string;
      original: string;
      embedding: number[] | undefined;
      searchText?: string;
      displayText?: string;
      chunkStartLine?: number;
      chunkEndLine?: number;
      startOffset?: number;
      endOffset?: number;
      charCount?: number;
    }> = [];

    // 如果有 embedding 配置，批量生成向量
    if (embeddingConfig) {
      log.info(`[VibeLearningIndexQueue] Generating embeddings for ${chunks.length} chunks`);

      // 批量处理以提高效率，每批最多 10 个，每批最多重试 3 次
      const batchSize = embeddingConfig.batchSize || 8;
      const maxRetries = 3;

      for (let i = 0; i < chunks.length; i += batchSize) {
        if (task) {
          this.throwIfTaskStale(task, "create_index_batch");
        }

        const batchChunks = chunks.slice(i, i + batchSize);
        const batchTexts = batchChunks.map(chunk => chunk.text);
        let batchSuccess = false;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            if (attempt > 0) {
              const delay = 1000 * Math.pow(2, attempt) + Math.random() * 500;
              await new Promise(r => setTimeout(r, delay));
              log.info(
                `[VibeLearningIndexQueue] Retry embedding batch ${i}, attempt ${attempt + 1}`
              );
            }

            if (task) {
              this.throwIfTaskStale(task, "create_index_embed");
            }

            const embeddings = await this.embedTexts(batchTexts, embeddingConfig);

            for (let j = 0; j < batchChunks.length; j++) {
              const chunk = batchChunks[j];
              const chunkText = chunk.text;
              const segmented = jieba.cutForSearch(chunkText, true).join(" ");
              processedChunks.push({
                text: segmented,
                original: chunkText,
                embedding: embeddings[j],
                searchText: segmented,
                displayText: chunkText,
                chunkStartLine: chunk.startLine,
                chunkEndLine: chunk.endLine,
                startOffset: chunk.startOffset,
                endOffset: chunk.endOffset,
                charCount: chunk.charCount,
              });
            }
            batchSuccess = true;
            break;
          } catch (error) {
            log.warn(
              `[VibeLearningIndexQueue] Embedding batch ${i} attempt ${attempt + 1} failed: ${error}`
            );
          }
        }

        if (!batchSuccess) {
          log.error(
            `[VibeLearningIndexQueue] Embedding batch ${i} failed after ${maxRetries} retries, degrading to FTS only`
          );
          for (let j = 0; j < batchChunks.length; j++) {
            const chunk = batchChunks[j];
            const chunkText = chunk.text;
            const segmented = jieba.cutForSearch(chunkText, true).join(" ");
            processedChunks.push({
              text: segmented,
              original: chunkText,
              embedding: undefined,
              searchText: segmented,
              displayText: chunkText,
              chunkStartLine: chunk.startLine,
              chunkEndLine: chunk.endLine,
              startOffset: chunk.startOffset,
              endOffset: chunk.endOffset,
              charCount: chunk.charCount,
            });
          }
        }
      }

      log.info(`[VibeLearningIndexQueue] Generated embeddings for resource ${resourceId}`);
    } else {
      // 没有 embedding 配置，只创建 FTS 索引
      for (const chunk of chunks) {
        const chunkText = chunk.text;
        const segmented = jieba.cutForSearch(chunkText, true).join(" ");
        processedChunks.push({
          text: segmented,
          original: chunkText,
          embedding: undefined,
          searchText: segmented,
          displayText: chunkText,
          chunkStartLine: chunk.startLine,
          chunkEndLine: chunk.endLine,
          startOffset: chunk.startOffset,
          endOffset: chunk.endOffset,
          charCount: chunk.charCount,
        });
      }
    }

    // 创建索引
    if (task) {
      this.throwIfTaskStale(task, "create_index_commit");
    }

    const indexCreated = vibeLearningDBManager.createIndex(
      mainDbName,
      projectId,
      resourceId,
      content,
      processedChunks
    );
    assertIndexCreated(indexCreated, resourceId);
  }

  private async createEmbeddingOnly(
    mainDbName: string,
    projectId: number,
    resourceId: number,
    content: string,
    task?: Pick<IndexTask, "resourceId" | "generation">
  ): Promise<void> {
    if (task) {
      this.throwIfTaskStale(task, "embedding_only_start");
    }

    const embeddingConfig = await this.getEmbeddingConfig();
    if (!embeddingConfig) {
      log.warn(
        `[VibeLearningIndexQueue] No embedding config, skipping embedding for resource ${resourceId}`
      );
      return;
    }

    // 分块
    const chunks = smartChunk(content, {
      minLength: 1000,
      maxLength: 2000,
      overlap: 0,
      splitter: "sentence",
    });

    log.info(`[VibeLearningIndexQueue] Generating embeddings only for ${chunks.length} chunks`);

    const processedChunks: Array<{ text: string; embedding: number[] }> = [];

    // 批量处理，每批最多重试 3 次
    const batchSize = embeddingConfig.batchSize || 8;
    const maxRetries = 3;
    const totalBatches = Math.ceil(chunks.length / batchSize);
    let completedBatches = 0;
    let failedBatches = 0;

    for (let i = 0; i < chunks.length; i += batchSize) {
      if (task) {
        this.throwIfTaskStale(task, "embedding_only_batch");
      }

      const batchChunks = chunks.slice(i, i + batchSize);
      let batchSuccess = false;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            const delay = 1000 * Math.pow(2, attempt) + Math.random() * 500;
            await new Promise(r => setTimeout(r, delay));
            log.info(
              `[VibeLearningIndexQueue] Retry embedding-only batch ${i}, attempt ${attempt + 1}`
            );
          }

          if (task) {
            this.throwIfTaskStale(task, "embedding_only_embed");
          }

          const embeddings = await this.embedTexts(batchChunks, embeddingConfig);

          for (let j = 0; j < batchChunks.length; j++) {
            const chunkText = batchChunks[j];
            const embedding = embeddings[j];
            if (embedding) {
              processedChunks.push({
                text: chunkText,
                embedding,
              });
            }
          }
          batchSuccess = true;
          break;
        } catch (error) {
          log.warn(
            `[VibeLearningIndexQueue] Embedding-only batch ${i} attempt ${attempt + 1} failed: ${error}`
          );
        }
      }

      if (batchSuccess) {
        completedBatches++;
      } else {
        failedBatches++;
        log.error(
          `[VibeLearningIndexQueue] Embedding-only batch ${i} failed after ${maxRetries} retries, skipping batch`
        );
      }

      // 上报 embedding 进度
      this.sendStatusWithProgress(resourceId, "embedding", {
        total: totalBatches,
        completed: completedBatches,
        failed: failedBatches,
        inProgress: totalBatches - completedBatches - failedBatches,
      });
    }

    // 仅添加向量索引
    if (task) {
      this.throwIfTaskStale(task, "embedding_only_commit");
    }

    vibeLearningDBManager.addEmbeddingsOnly(mainDbName, projectId, resourceId, processedChunks);

    log.info(`[VibeLearningIndexQueue] Added embeddings for resource ${resourceId}`);
  }

  private isRemoteUrl(path: string): boolean {
    return path.startsWith("http://") || path.startsWith("https://");
  }

  private async buildSourceStableId(originalPath: string, localFilePath: string): Promise<string> {
    if (this.isRemoteUrl(originalPath)) {
      return `remote:${originalPath}`;
    }

    try {
      const realPath = await fs.realpath(localFilePath);
      return `local:${realPath}`;
    } catch {
      return `local:${localFilePath}`;
    }
  }

  /**
   * 检查是否为音频文件
   */
  private isAudioFile(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase();
    const audioExtensions = [".mp3", ".wav", ".flac", ".aac", ".ogg", ".wma", ".m4a", ".opus"];
    return audioExtensions.includes(ext);
  }

  /**
   * 检查是否为媒体文件（音频或视频）
   */
  private isMediaFile(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase();
    const mediaExtensions = [
      // 视频
      ".mp4",
      ".mkv",
      ".avi",
      ".mov",
      ".wmv",
      ".flv",
      ".webm",
      ".m4v",
      ".ts",
      // 音频
      ".mp3",
      ".wav",
      ".flac",
      ".aac",
      ".ogg",
      ".wma",
      ".m4a",
      ".opus",
    ];
    return mediaExtensions.includes(ext);
  }

  private async downloadRemoteFile(url: string): Promise<string> {
    const hash = crypto.createHash("md5").update(url).digest("hex").slice(0, 8);
    const ext = this.getExtFromUrl(url) || ".tmp";
    const tempDir = join(PathUtil.getAppDir(), "vibe-learning-temp");
    const tempPath = join(tempDir, `${hash}-${Date.now()}${ext}`);

    // 确保目录存在
    await fs.mkdir(tempDir, { recursive: true });

    // 下载文件
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`Download failed: HTTP ${response.status}`);
    }

    if (!response.body) {
      throw new Error("Download failed: No response body");
    }

    // 写入文件
    const fileStream = createWriteStream(tempPath);
    await pipeline(response.body, fileStream);

    return tempPath;
  }

  private getExtFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const ext = extname(pathname);
      return ext || "";
    } catch {
      return "";
    }
  }

  async checkMarkdownExists(relativePath: string): Promise<boolean> {
    try {
      const absolutePath = this.getAbsoluteMarkdownPath(relativePath);
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  async deleteResourceComplete(params: {
    resourceId: number;
    projectId: number;
    mainDbName: string;
    markdownPath?: string;
  }): Promise<boolean> {
    const { resourceId, projectId, mainDbName, markdownPath } = params;

    log.info(
      `[VibeLearningIndexQueue] Deleting resource complete: resourceId=${resourceId}, projectId=${projectId}`
    );

    try {
      // 1. 从队列中移除待处理任务（如果存在）
      const taskIndex = this.queue.findIndex(t => t.resourceId === resourceId);
      if (taskIndex >= 0) {
        this.queue.splice(taskIndex, 1);
        log.info(`[VibeLearningIndexQueue] Removed pending task for resource ${resourceId}`);
      }

      // 清除处理状态
      this.processingStatus.delete(resourceId);

      // 2. 删除 FTS 和向量索引
      try {
        vibeLearningDBManager.removeIndex(mainDbName, projectId, resourceId);
        log.info(`[VibeLearningIndexQueue] Removed index for resource ${resourceId}`);
      } catch (error) {
        log.warn(
          `[VibeLearningIndexQueue] Failed to remove index for resource ${resourceId}: ${error}`
        );
        // 继续执行，不中断删除流程
      }

      // 3. 删除 Markdown 文件
      if (markdownPath) {
        try {
          const absolutePath = this.getAbsoluteMarkdownPath(markdownPath);
          await fs.unlink(absolutePath);
          log.info(`[VibeLearningIndexQueue] Deleted markdown file: ${absolutePath}`);
        } catch (error) {
          log.warn(`[VibeLearningIndexQueue] Failed to delete markdown file: ${error}`);
          // 继续执行，不中断删除流程
        }
      }

      // 4. 删除数据库记录
      const db = databaseModule.getDatabase(mainDbName);
      if (db) {
        VibeLearningResourceTable.deleteResource(db, resourceId);
        log.info(`[VibeLearningIndexQueue] Deleted database record for resource ${resourceId}`);
      }

      log.info(`[VibeLearningIndexQueue] Successfully deleted resource ${resourceId} completely`);
      return true;
    } catch (error) {
      log.error(`[VibeLearningIndexQueue] Error deleting resource complete: ${error}`);
      return false;
    }
  }

  /**
   * 根据资源名称查找资源
   */
  private async findResourceByName(
    mainDbName: string,
    projectId: number,
    resourceName: string
  ): Promise<{
    id: number;
    markdownPath: string | null;
    name: string;
  } | null> {
    const db = databaseModule.getDatabase(mainDbName);

    if (!db) {
      return null;
    }

    const resources = VibeLearningResourceTable.getResourcesByProjectId(db, projectId);

    // 精确匹配或模糊匹配
    const exactMatch = resources.find(r => r.name === resourceName);
    if (exactMatch) {
      return {
        id: exactMatch.id,
        markdownPath: exactMatch.markdownPath,
        name: exactMatch.name,
      };
    }

    // 模糊匹配：忽略大小写和扩展名
    const normalizedName = resourceName.toLowerCase().replace(/\.[^.]+$/, "");
    const fuzzyMatch = resources.find(r => {
      const rName = r.name.toLowerCase().replace(/\.[^.]+$/, "");
      return rName === normalizedName || rName.includes(normalizedName);
    });

    if (fuzzyMatch) {
      return {
        id: fuzzyMatch.id,
        markdownPath: fuzzyMatch.markdownPath,
        name: fuzzyMatch.name,
      };
    }

    return null;
  }

  private async resolveResource(params: {
    mainDbName: string;
    projectId: number;
    resourceId?: number;
    resourceName?: string;
  }): Promise<{
    id: number;
    markdownPath: string | null;
    name: string;
  } | null> {
    const db = databaseModule.getDatabase(params.mainDbName);
    if (!db) {
      return null;
    }

    if (typeof params.resourceId === "number") {
      const resource = VibeLearningResourceTable.getResourceById(db, params.resourceId);
      if (resource && resource.projectId === params.projectId) {
        return {
          id: resource.id,
          markdownPath: resource.markdownPath,
          name: resource.name,
        };
      }
    }

    if (params.resourceName) {
      return this.findResourceByName(params.mainDbName, params.projectId, params.resourceName);
    }

    return null;
  }

  private async resolveReadableMarkdown(params: {
    mainDbName: string;
    projectId: number;
    resourceId?: number;
    resourceName?: string;
  }): Promise<{
    resource: {
      id: number;
      markdownPath: string;
      name: string;
    };
    absolutePath: string;
  }> {
    const resource = await this.resolveResource(params);
    const label = params.resourceId ?? params.resourceName ?? "unknown";

    if (!resource) {
      throw new Error(`未找到资源 "${label}"`);
    }

    if (!resource.markdownPath) {
      throw new Error(`资源 "${resource.name}" 尚未转换为 Markdown`);
    }

    const absolutePath = this.getAbsoluteMarkdownPath(resource.markdownPath);
    const exists = await this.checkMarkdownExists(resource.markdownPath);
    if (!exists) {
      throw new Error("Markdown 文件不存在，可能需要重新转换");
    }

    return {
      resource: {
        id: resource.id,
        markdownPath: resource.markdownPath,
        name: resource.name,
      },
      absolutePath,
    };
  }

  private clampRange(
    start: number,
    end: number,
    max: number
  ): { start: number; end: number; truncated: boolean } {
    const validStart = Math.max(0, Math.min(Math.floor(start), max));
    const requestedEnd = Math.max(validStart, Math.min(Math.floor(end), max));
    const limitedEnd = Math.min(requestedEnd, validStart + MAX_RESOURCE_READ_CHARS);
    return {
      start: validStart,
      end: limitedEnd,
      truncated: limitedEnd < requestedEnd,
    };
  }

  async readMarkdownContent(params: {
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
    const { projectId, resourceName, mainDbName } = params;

    try {
      const { resource, absolutePath } = await this.resolveReadableMarkdown({
        mainDbName,
        projectId,
        resourceName,
      });

      const content = await fs.readFile(absolutePath, "utf-8");
      const lines = content.split("\n");
      const truncatedContent =
        content.length > MAX_RESOURCE_READ_CHARS
          ? content.slice(0, MAX_RESOURCE_READ_CHARS) +
            "\n\n... [内容已截断，请使用 read_resource_lines 或 read_resource_range 工具分段读取]"
          : content;

      return {
        success: true,
        content: truncatedContent,
        totalLines: lines.length,
        resourceName: resource.name,
      };
    } catch (error) {
      log.error(`[VibeLearningIndexQueue] Error reading markdown: ${error}`);
      return {
        success: false,
        error: `读取失败: ${(error as Error).message}`,
      };
    }
  }

  async readMarkdownRange(params: {
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
    const { projectId, resourceName, mainDbName, startLine, endLine } = params;
    return this.readResourceLines({
      mainDbName,
      projectId,
      resourceName,
      startLine,
      endLine,
    });
  }

  async readResourceLines(params: {
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
    const { startLine, endLine } = params;

    try {
      const { resource, absolutePath } = await this.resolveReadableMarkdown({
        mainDbName: params.mainDbName,
        projectId: params.projectId,
        resourceId: params.resourceId,
        resourceName: params.resourceName,
      });
      const requestedStartLine = Math.max(1, Math.floor(startLine));
      const requestedEndLine = Math.max(requestedStartLine, Math.floor(endLine));
      const range = await readMarkdownLines(absolutePath, {
        startLine: requestedStartLine,
        endLine: requestedEndLine,
        maxChars: MAX_RESOURCE_READ_CHARS,
      });

      return {
        success: true,
        resourceId: resource.id,
        resourceName: resource.name,
        startLine: range.startLine,
        endLine: range.endLine,
        totalLines: range.totalLines,
        truncated: range.truncated,
        content: range.content,
      };
    } catch (error) {
      log.error(`[VibeLearningIndexQueue] Error reading resource lines: ${error}`);
      return {
        success: false,
        error: `读取失败: ${(error as Error).message}`,
      };
    }
  }

  async readResourceRange(params: {
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
    try {
      const { resource, absolutePath } = await this.resolveReadableMarkdown({
        mainDbName: params.mainDbName,
        projectId: params.projectId,
        resourceId: params.resourceId,
        resourceName: params.resourceName,
      });
      const content = await fs.readFile(absolutePath, "utf-8");
      const range = this.clampRange(params.startOffset, params.endOffset, content.length);

      return {
        success: true,
        resourceId: resource.id,
        resourceName: resource.name,
        startOffset: range.start,
        endOffset: range.end,
        totalChars: content.length,
        truncated: range.truncated,
        content: content.slice(range.start, range.end),
      };
    } catch (error) {
      log.error(`[VibeLearningIndexQueue] Error reading resource range: ${error}`);
      return {
        success: false,
        error: `读取失败: ${(error as Error).message}`,
      };
    }
  }

  async readSearchHitContext(params: {
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
    const { projectId, resourceName, mainDbName, chunkIndex } = params;
    const radius = Math.min(MAX_HIT_CONTEXT_RADIUS, Math.max(1, Math.floor(params.radius || 1)));

    try {
      const { resource, absolutePath } = await this.resolveReadableMarkdown({
        mainDbName,
        projectId,
        resourceName,
      });
      const content = await fs.readFile(absolutePath, "utf-8");
      const chunks = smartChunkWithRanges(content, {
        minLength: 1000,
        maxLength: 2000,
        overlap: 0,
        splitter: "sentence",
      });
      const targetIndex = Math.min(Math.max(chunkIndex, 0), Math.max(0, chunks.length - 1));
      const startChunkIndex = Math.max(0, targetIndex - radius);
      const endChunkIndex = Math.min(chunks.length - 1, targetIndex + radius);
      const selected = chunks.slice(startChunkIndex, endChunkIndex + 1);

      return {
        success: true,
        resourceName: resource.name,
        chunkIndex,
        startChunkIndex,
        endChunkIndex,
        chunkStartLine: selected[0]?.startLine,
        chunkEndLine: selected[selected.length - 1]?.endLine,
        startOffset: selected[0]?.startOffset,
        endOffset: selected[selected.length - 1]?.endOffset,
        content: selected.map(chunk => chunk.text).join("\n\n---\n\n"),
      };
    } catch (error) {
      log.error(`[VibeLearningIndexQueue] Error reading search hit context: ${error}`);
      return {
        success: false,
        error: `读取命中上下文失败: ${(error as Error).message}`,
      };
    }
  }

  async searchContent(params: {
    projectId: number;
    mainDbName: string;
    query: string;
    limit?: number;
  }): Promise<VLSearchResult[]> {
    const { projectId, mainDbName, query, limit = 5 } = params;

    log.info(
      `[VibeLearningIndexQueue] Searching content: projectId=${projectId}, query="${query}", limit=${limit}`
    );

    try {
      const embeddingConfig = await this.getEmbeddingConfig();
      log.info("[SearchCore][vibe-learning][config]", {
        query,
        limit,
        projectId,
        mainDbName,
        vectorEnabled: Boolean(embeddingConfig),
        vectorModel: embeddingConfig?.model,
      });

      const adapter = createVibeLearningAdapter();
      const { results, log: pipelineLog } = await runSearchPipeline({
        query,
        limit,
        context: {
          projectId,
          mainDbName,
          vector: embeddingConfig
            ? {
                distance: embeddingConfig.distance,
                embedQuery: async (queryText: string) => {
                  try {
                    const queryEmbedding = (await this.embedTexts([queryText], embeddingConfig))[0];
                    return queryEmbedding || null;
                  } catch (error) {
                    log.error(`[VibeLearningIndexQueue] Vec query embedding failed: ${error}`);
                    return null;
                  }
                },
              }
            : null,
        },
        adapter,
        logger: pipelineState => {
          log.info("[SearchCore][vibe-learning]", pipelineState);
        },
        stageLogger: stageLog => {
          log.info(`[SearchCore][vibe-learning][${stageLog.stage}]`, stageLog);
        },
      });

      log.info(
        `[VibeLearningIndexQueue] Hybrid search completed: found ${results.length} results (FTS: ${pipelineLog.ftsCount}, Vec: ${pipelineLog.vecCount})`
      );

      const enrichedResults = results.map(result => {
        const chunkMetadata =
          typeof result.chunkIndex === "number"
            ? vibeLearningDBManager.getChunkMetadata(
                mainDbName,
                projectId,
                result.resourceId,
                result.chunkIndex
              )
            : null;

        return {
          ...result,
          displayContent: chunkMetadata?.displayContent || result.content,
          searchContent: chunkMetadata?.searchContent || result.content,
          chunkStartLine: chunkMetadata?.chunkStartLine,
          chunkEndLine: chunkMetadata?.chunkEndLine,
          startOffset: chunkMetadata?.startOffset,
          endOffset: chunkMetadata?.endOffset,
          charCount: chunkMetadata?.charCount,
          chunkLevel: "passage",
          evidenceScore: result.score,
          whyMatched: "命中正文内容，可使用返回的行号或字符范围继续补读上下文。",
        };
      });

      return enrichedResults.map((result): VLSearchResult => ({
        ...result,
        displayContent: String(result.displayContent || result.content),
        searchContent: String(result.searchContent || result.content),
        chunkLevel: (result.chunkLevel as VLSearchResult["chunkLevel"]) || "passage",
        evidenceScore:
          typeof result.evidenceScore === "number" ? result.evidenceScore : result.score,
        whyMatched: String(result.whyMatched || "命中正文内容，可继续补读上下文。"),
      }));
    } catch (error) {
      log.error(`[VibeLearningIndexQueue] Search failed: ${error}`);
      return [];
    }
  }

  async grepContent(params: {
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
    const query = typeof params.query === "string" ? params.query.trim() : "";
    const limit = Math.min(Math.max(1, Math.floor(params.limit || 20)), MAX_GREP_RESULTS);

    if (!query) {
      return {
        success: false,
        query: typeof params.query === "string" ? params.query : "",
        results: [],
        error: "缺少必需的 query 参数",
      };
    }

    try {
      const db = databaseModule.getDatabase(params.mainDbName);
      if (!db) {
        return {
          success: false,
          query,
          results: [],
          error: "Database not found",
        };
      }

      const resources = VibeLearningResourceTable.getResourcesByProjectId(
        db,
        params.projectId
      ).filter(resource => Boolean(resource.markdownPath));
      const pathToResource = new Map<string, { id: number; name: string; markdownPath: string }>();
      const filePaths = resources.map(resource => {
        const markdownPath = resource.markdownPath as string;
        const absolutePath = this.getAbsoluteMarkdownPath(markdownPath);
        pathToResource.set(absolutePath, {
          id: resource.id,
          name: resource.name,
          markdownPath,
        });
        return absolutePath;
      });

      if (filePaths.length === 0) {
        return {
          success: true,
          query,
          results: [],
        };
      }

      const args = [
        "--json",
        "--line-number",
        "--column",
        "--with-filename",
        "--no-heading",
        "--max-count",
        String(limit),
      ];
      if (!params.isRegex) {
        args.push("--fixed-strings");
      }
      if (params.ignoreCase) {
        args.push("--ignore-case");
      }
      args.push(query, ...filePaths);

      const child = spawn(ripgrepBinaryPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });
      const stderrChunks: Buffer[] = [];

      child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

      const stdoutLines = createInterface({
        input: child.stdout,
        crlfDelay: Infinity,
      });
      const resultsPromise = parseRipgrepJsonLines({
        lines: stdoutLines,
        pathToResource,
        limit,
        previewRadius: GREP_PREVIEW_RADIUS,
        getLineStartOffsets: buildLineStartOffsets,
        onLimitReached: () => {
          child.kill();
        },
      });
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        child.on("error", reject);
        child.on("close", resolve);
      });
      const results = await resultsPromise;

      const stderr = Buffer.concat(stderrChunks).toString("utf-8").trim();
      if (exitCode !== 0 && exitCode !== 1 && results.length < limit) {
        return {
          success: false,
          query,
          results: [],
          error: stderr || `ripgrep failed with code ${exitCode}`,
        };
      }

      return {
        success: true,
        query,
        results,
      };
    } catch (error) {
      log.error(`[VibeLearningIndexQueue] Grep failed: ${error}`);
      return {
        success: false,
        query,
        results: [],
        error: `grep 查询失败: ${(error as Error).message}`,
      };
    }
  }

  async checkAndRecoverResources(
    mainDbName: string,
    options: RecoverResourcesOptions = {}
  ): Promise<void> {
    log.info(`[VibeLearningIndexQueue] Checking resources for database: ${mainDbName}`);

    try {
      const db = databaseModule.getDatabase(mainDbName);

      if (!db) {
        log.warn("[VibeLearningIndexQueue] No database connection");
        return;
      }

      // 检查是否有 vibe_learning_resources 表
      const tableExists = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='vibe_learning_resources'"
        )
        .get();

      if (!tableExists) {
        log.info("[VibeLearningIndexQueue] vibe_learning_resources table not found, skipping");
        return;
      }

      // 获取所有资源
      const allResources = VibeLearningResourceTable.getAllResources(db);

      log.info(`[VibeLearningIndexQueue] Found ${allResources.length} resources to check`);

      const forceEmbedding = options.forceEmbedding === true;
      let processed = 0;

      for (const resource of allResources) {
        // 检查状态
        const status = await this.computeResourceStatus(resource, mainDbName, {
          forceEmbedding,
        });

        if (status === "pending" || status === "need_convert" || status === "need_download") {
          // 需要完整处理（对于 bilibili 视频，full 任务会自动处理下载）
          const result = this.addTask({
            resourceId: resource.id,
            projectId: resource.projectId,
            mainDbName,
            originalPath: resource.originalPath,
            resourceName: resource.name,
            type: "full",
          });
          if (result.accepted) {
            log.info(
              `[VibeLearningIndexQueue] Added full task for resource ${resource.id} (status: ${status}, sourceType: ${resource.sourceType || "local"})`
            );
          } else {
            log.info(
              `[VibeLearningIndexQueue] Skip full task for resource ${resource.id}, reason=${result.reason}, currentStatus=${result.currentStatus}`
            );
          }
        } else if (status === "need_index") {
          // 只需要索引
          const result = this.addTask({
            resourceId: resource.id,
            projectId: resource.projectId,
            mainDbName,
            originalPath: resource.originalPath,
            resourceName: resource.name,
            markdownPath: resource.markdownPath || undefined,
            type: "index_only",
          });
          if (result.accepted) {
            log.info(`[VibeLearningIndexQueue] Added index_only task for resource ${resource.id}`);
          } else {
            log.info(
              `[VibeLearningIndexQueue] Skip index_only task for resource ${resource.id}, reason=${result.reason}, currentStatus=${result.currentStatus}`
            );
          }
        } else if (status === "need_embedding") {
          // 只需要生成 embedding
          const result = this.addTask({
            resourceId: resource.id,
            projectId: resource.projectId,
            mainDbName,
            originalPath: resource.originalPath,
            resourceName: resource.name,
            markdownPath: resource.markdownPath || undefined,
            type: "embedding_only",
          });
          if (result.accepted) {
            log.info(
              `[VibeLearningIndexQueue] Added embedding_only task for resource ${resource.id}`
            );
          } else {
            log.info(
              `[VibeLearningIndexQueue] Skip embedding_only task for resource ${resource.id}, reason=${result.reason}, currentStatus=${result.currentStatus}`
            );
          }
        }
        processed += 1;
        await yieldEvery(processed, VibeLearningIndexQueue.RECOVER_YIELD_EVERY);
      }
      await yieldToEventLoop();
    } catch (error) {
      log.error(`[VibeLearningIndexQueue] Error checking resources: ${error}`);
    }
  }

  /**
   * 计算资源状态
   */
  private async computeResourceStatus(
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
    // 检查是否在处理队列中
    const queueStatus = this.getResourceStatus(resource.id);
    if (queueStatus) {
      return queueStatus;
    }

    // 对于 Bilibili 视频，检查本地缓存
    if (resource.sourceType === "bilibili" && resource.sourceMetaInfo) {
      try {
        const meta = JSON.parse(resource.sourceMetaInfo) as BilibiliSourceMeta;
        const cacheStatus = await getBilibiliCacheStatus(meta.bvid, meta.cid, meta.quality);

        // 如果没有本地缓存且没有 markdown，需要完整处理（下载+转录+索引）
        if (!cacheStatus?.localPath && !resource.markdownPath) {
          return "need_download";
        }
      } catch (e) {
        log.warn(
          `[VibeLearningIndexQueue] Failed to parse bilibili meta for resource ${resource.id}: ${e}`
        );
      }
    }

    if (resource.sourceType === "youtube" && resource.sourceMetaInfo) {
      try {
        const meta = JSON.parse(resource.sourceMetaInfo) as YoutubeSourceMeta;
        const sourceUrl = (meta.url || resource.originalPath || "").trim();
        if (sourceUrl) {
          const cacheStatus = await getYoutubeCacheStatus(sourceUrl);
          if (!cacheStatus?.localPath && !resource.markdownPath) {
            return "need_download";
          }
        }
      } catch (e) {
        log.warn(
          `[VibeLearningIndexQueue] Failed to parse youtube meta for resource ${resource.id}: ${e}`
        );
      }
    }

    // 检查是否有 markdown_path
    if (!resource.markdownPath) {
      return "pending";
    }

    // 检查 Markdown 文件是否存在
    const mdExists = await this.checkMarkdownExists(resource.markdownPath);
    if (!mdExists) {
      return "need_convert";
    }

    // 检查 FTS 索引是否存在
    const ftsIndexExists = vibeLearningDBManager.checkIndexExists(
      mainDbName,
      resource.projectId,
      resource.id
    );
    if (!ftsIndexExists) {
      return "need_index";
    }

    if (options.forceEmbedding) {
      return "need_embedding";
    }

    // 如果配置了 embedding，检查向量索引是否存在
    const embeddingConfig = await this.getEmbeddingConfig();
    if (embeddingConfig) {
      const vecIndexExists = vibeLearningDBManager.checkVecIndexExists(
        mainDbName,
        resource.projectId,
        resource.id
      );
      if (!vecIndexExists) {
        return "need_embedding";
      }
    }

    return "completed";
  }

  async reinitAllVecTables(dimensions: number, mainDbName?: string): Promise<boolean> {
    log.info(`[VibeLearningIndexQueue] Reinit all vec tables with dimensions: ${dimensions}`);

    try {
      // 清除 embedding 配置缓存，下次会重新读取
      this.clearEmbeddingConfigCache();

      // 更新 VibeLearningDBManager 的维度配置
      vibeLearningDBManager.setVecDimensions(dimensions);

      const targetDbName = mainDbName || databaseModule.getCurrentDatabaseName();
      const db = databaseModule.getDatabase(targetDbName);

      if (!db) {
        log.warn("[VibeLearningIndexQueue] No database connection");
        return false;
      }

      // 检查是否有 vibe_learning_projects 表
      const tableExists = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='vibe_learning_projects'"
        )
        .get();

      if (!tableExists) {
        log.info("[VibeLearningIndexQueue] vibe_learning_projects table not found, skipping");
        return true;
      }

      // 获取所有项目 ID
      const projects = db.prepare("SELECT id FROM vibe_learning_projects").all() as Array<{
        id: number;
      }>;

      // 为每个项目重建向量表
      let processed = 0;
      for (const project of projects) {
        vibeLearningDBManager.reinitVecTable(targetDbName, project.id, dimensions);
        processed += 1;
        await yieldEvery(processed, VibeLearningIndexQueue.RECOVER_YIELD_EVERY);
      }
      await yieldToEventLoop();

      log.info(`[VibeLearningIndexQueue] Reinit vec tables for ${projects.length} projects`);
      return true;
    } catch (error) {
      log.error(`[VibeLearningIndexQueue] Error reinit vec tables: ${error}`);
      return false;
    }
  }

  async reembeddingAllResources(): Promise<boolean> {
    log.info("[VibeLearningIndexQueue] Reembedding all resources");

    try {
      // 清除 embedding 配置缓存
      this.clearEmbeddingConfigCache();

      // 检查是否有 embedding 配置
      const embeddingConfig = await this.getEmbeddingConfig();
      if (!embeddingConfig) {
        log.warn("[VibeLearningIndexQueue] No embedding config, skipping reembedding");
        return false;
      }

      const currentDbName = databaseModule.getCurrentDatabaseName();
      const db = databaseModule.getDatabase(currentDbName);

      if (!db) {
        log.warn("[VibeLearningIndexQueue] No database connection");
        return false;
      }

      // 检查是否有 vibe_learning_resources 表
      const tableExists = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='vibe_learning_resources'"
        )
        .get();

      if (!tableExists) {
        log.info("[VibeLearningIndexQueue] vibe_learning_resources table not found, skipping");
        return true;
      }

      // 获取所有资源
      const allResources = VibeLearningResourceTable.getAllResources(db);

      log.info(
        `[VibeLearningIndexQueue] Adding embedding tasks for ${allResources.length} resources`
      );

      // 为每个有 markdown 的资源添加 embedding 任务
      for (const resource of allResources) {
        if (resource.markdownPath) {
          const result = this.addTask({
            resourceId: resource.id,
            projectId: resource.projectId,
            mainDbName: currentDbName,
            originalPath: resource.originalPath,
            resourceName: resource.name,
            markdownPath: resource.markdownPath,
            type: "embedding_only",
          });
          if (!result.accepted) {
            log.info(
              `[VibeLearningIndexQueue] Skip reembedding task for resource ${resource.id}, reason=${result.reason}, currentStatus=${result.currentStatus}`
            );
          }
        }
      }

      return true;
    } catch (error) {
      log.error(`[VibeLearningIndexQueue] Error reembedding resources: ${error}`);
      return false;
    }
  }
}

const vibeLearningIndexQueue = new VibeLearningIndexQueue();
export default vibeLearningIndexQueue;
