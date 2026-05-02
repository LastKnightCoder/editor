import { EventEmitter } from "events";
import { ipcMain, BrowserWindow, app } from "electron";
import { promises as fs } from "fs";
import { join, dirname, extname } from "node:path";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import os from "node:os";
import log from "electron-log";
import fetch from "node-fetch";
import OpenAI from "openai";
import { Module } from "../types/module";
import PathUtil from "../utils/PathUtil";
import vibeLearningDBManager from "./vibe-learning-db";
import markitdownModule from "./markitdown";
import databaseModule from "./database";
import transcriptionModule, { type TranscriptionResult } from "./transcription";
import VibeLearningResourceTable from "./tables/vibe-learning-resource";
import { cacheBilibiliVideo, getBilibiliCacheStatus } from "./bilibili-cache";
import { cacheYoutubeVideo, getYoutubeCacheStatus } from "./youtube-cache";
import vibeLearningMediaCache, {
  hashPayload,
  hashString,
} from "./vibe-learning-media-cache";
import { Jieba } from "@node-rs/jieba";
import { dict } from "@node-rs/jieba/dict";
import crypto from "node:crypto";
import type { LLMUsageConfig, ProviderConfig } from "@/types/llm";
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
import {
  splitMarkdownByAI,
  simpleSplitByHeadings,
  generateSummaryIndex,
  buildChapterFileName,
  listChapterFilesSorted,
  type Chapter,
  type TaskProgress,
} from "./vibe-learning-ai-chapter-splitter";
import {
  TRANSCRIPTION_OPTIMIZATION_SYSTEM_PROMPT,
  buildTranscriptionOptimizationUserPrompt,
} from "@/constants/prompts/transcription-optimization";
import {
  DEFAULT_LOCAL_EMBEDDING_DISTANCE,
  LOCAL_EMBEDDING_CONFIG_ID,
} from "@/constants/embedding";
import pythonService from "./python-service";
import { getFriendlyPythonRuntimeErrorMessage } from "../utils/python-runtime-error-message";
import { smartChunk } from "../utils/smart-chunk";
import { readSearchModelProviderConfig } from "../utils/search-model-config";
import YtDlpService from "../utils/YtDlpService";
import { runSearchPipeline } from "./search-core/pipeline";
import { createVibeLearningAdapter } from "./search-core/vibe-learning-adapter";
import {
  buildSectionNodesFromMarkdown,
  resolveSectionContextForLineRange,
} from "./vibe-learning-section-index";
import { buildChunkLineMap } from "./vibe-learning-chunk-line-map";
import { LocalQueryExpander, NoopExpander } from "./search-core/expander";
import { LocalReranker, NoopReranker } from "./search-core/reranker";
import { calculateLexicalScore } from "./search-core/retriever";
import {
  buildVLTranscriptionOptions,
  resolveVLOptimizationLanguage,
  type VLTranscriptionModelSize,
} from "./vibe-learning-transcription";
import { yieldEvery, yieldToEventLoop } from "../utils/event-loop-yield";

const CHAPTER_CHUNK_OFFSET = 10_000;
const MAX_HIT_CONTEXT_RADIUS = 3;

interface ChapterOutline {
  index: number;
  title: string;
  summary?: string;
  fileName?: string;
  charCount?: number;
}

interface DecodedChunkLocation {
  hitType: "summary" | "chapter";
  chapterIndex?: number;
  chunkIndexInSection: number;
}

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
  llmProvider?: string;
  llmApiKey?: string;
  llmModel?: string;
  llmBaseUrl?: string;
}

interface SettingForTranscription {
  transcription?: {
    currentModel?: string;
  };
  llmUsageSettings?: {
    transcriptionOptimization?: LLMUsageConfig | null;
  };
  llmConfigs?: ProviderConfig[];
}

interface ImageDescriptionConfig {
  llmProvider: string;
  llmApiKey: string;
  llmModel: string;
  llmBaseUrl?: string;
}

interface SettingForImageDescription {
  llmUsageSettings?: {
    vibeLearningImageDescription?: LLMUsageConfig | null;
  };
  llmConfigs?: ProviderConfig[];
}

interface DocSummaryConfig {
  llmProvider: string;
  llmApiKey: string;
  llmModel: string;
  llmBaseUrl?: string;
}

interface SettingForDocSummary {
  llmUsageSettings?: {
    vibeLearningDocSummary?: LLMUsageConfig | null;
  };
  llmConfigs?: ProviderConfig[];
}

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
  | "summarizing" // 正在生成 AI 摘要
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

  constructor(
    resourceId: number,
    taskGeneration: number,
    currentGeneration: number,
  ) {
    super(
      `resource ${resourceId} task stale: taskGeneration=${taskGeneration}, currentGeneration=${currentGeneration}`,
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
  private taskProgressMap: Map<
    number,
    { status: TaskStatus; taskProgress: TaskProgress }
  > = new Map();

  // 缓存 embedding 配置
  private cachedEmbeddingConfig: EmbeddingConfig | null | undefined = undefined;

  // 缓存转译配置
  private cachedTranscriptionConfig: TranscriptionConfig | null | undefined =
    undefined;

  // 缓存图片描述配置
  private cachedImageDescriptionConfig:
    | ImageDescriptionConfig
    | null
    | undefined = undefined;

  // 缓存文档摘要配置
  private cachedDocSummaryConfig: DocSummaryConfig | null | undefined =
    undefined;
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
      const currentConfig = configs?.find((c) => c.id === currentConfigId);

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
      const modelConfig = models?.find((m) => m.name === currentModel);

      if (!currentModel || !modelConfig) {
        this.cachedEmbeddingConfig = null;
        return null;
      }

      const resolvedProviderType: EmbeddingProviderType =
        providerType === "local_python" ||
        currentConfig.id === LOCAL_EMBEDDING_CONFIG_ID
          ? "local_python"
          : "remote_openai";

      if (resolvedProviderType === "remote_openai" && (!apiKey || !baseUrl)) {
        this.cachedEmbeddingConfig = null;
        return null;
      }

      const distance =
        modelConfig.distance ||
        (resolvedProviderType === "local_python"
          ? DEFAULT_LOCAL_EMBEDDING_DISTANCE
          : 0);

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
        localModelDir:
          localModelDir || join(app.getPath("userData"), "embedding-models"),
      };

      // 更新 VibeLearningDBManager 的维度配置
      vibeLearningDBManager.setVecDimensions(modelConfig.contextLength);

      log.info(
        `[VibeLearningIndexQueue] Loaded embedding config: model=${currentModel}, dimensions=${modelConfig.contextLength}`,
      );

      return this.cachedEmbeddingConfig;
    } catch (error) {
      log.error(
        `[VibeLearningIndexQueue] Error loading embedding config: ${error}`,
      );
      this.cachedEmbeddingConfig = null;
      return null;
    }
  }

  private async embedTexts(
    texts: string[],
    embeddingConfig: EmbeddingConfig,
  ): Promise<number[][]> {
    if (!texts.length) {
      return [];
    }

    if (embeddingConfig.providerType === "local_python") {
      const client = await pythonService.ensureStarted();
      const res = await client.request<{
        embeddings: number[][];
      }>("embed_texts", {
        texts,
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

    return res.data.map((item) => item.embedding);
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

      // 获取转录模型配置
      const { transcription, llmUsageSettings, llmConfigs } = setting;

      // 提取模型名称（如 "faster-whisper-base" -> "base"）
      let model = "base";
      if (transcription?.currentModel) {
        const modelName = transcription.currentModel;
        // 从模型名称中提取大小（去掉 "faster-whisper-" 前缀）
        if (modelName.startsWith("faster-whisper-")) {
          model = modelName.replace("faster-whisper-", "");
        } else {
          model = modelName;
        }
      }

      // 获取模型目录
      const modelDir = transcriptionModule.getModelsDir();

      // 获取 LLM 优化配置（始终启用）
      let llmProvider: string | undefined;
      let llmApiKey: string | undefined;
      let llmModel: string | undefined;
      let llmBaseUrl: string | undefined;

      const transcriptionOptConfig =
        llmUsageSettings?.transcriptionOptimization;
      if (transcriptionOptConfig?.providerId && llmConfigs) {
        const llmConfig = llmConfigs.find(
          (c) => c.id === transcriptionOptConfig.providerId,
        );
        if (llmConfig) {
          // Python 端只支持 openai/azure/ollama 三种 provider
          // 大多数 LLM 服务都兼容 OpenAI API，统一使用 "openai"
          llmProvider = "openai";
          llmApiKey = llmConfig.apiKey;
          llmBaseUrl = llmConfig.baseUrl;
          llmModel = transcriptionOptConfig.modelName;
        }
      }

      this.cachedTranscriptionConfig = {
        model,
        modelDir,
        llmProvider,
        llmApiKey,
        llmModel,
        llmBaseUrl,
      };

      log.info(
        `[VibeLearningIndexQueue] Loaded transcription config: model=${model}, modelDir=${modelDir}, llmProvider=${llmProvider || "none"}`,
      );

      return this.cachedTranscriptionConfig;
    } catch (error) {
      log.error(
        `[VibeLearningIndexQueue] Error loading transcription config: ${error}`,
      );
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
      const setting: SettingForImageDescription = JSON.parse(settingContent);

      const { llmUsageSettings, llmConfigs } = setting;

      const imageDescConfig = llmUsageSettings?.vibeLearningImageDescription;
      if (!imageDescConfig?.providerId || !llmConfigs) {
        this.cachedImageDescriptionConfig = null;
        return null;
      }

      const llmConfig = llmConfigs.find(
        (c) => c.id === imageDescConfig.providerId,
      );
      if (!llmConfig) {
        this.cachedImageDescriptionConfig = null;
        return null;
      }

      // Python 端使用 OpenAI 兼容接口
      this.cachedImageDescriptionConfig = {
        llmProvider: "openai",
        llmApiKey: llmConfig.apiKey,
        llmModel: imageDescConfig.modelName,
        llmBaseUrl: llmConfig.baseUrl,
      };

      log.info(
        `[VibeLearningIndexQueue] Loaded image description config: model=${imageDescConfig.modelName}, baseUrl=${llmConfig.baseUrl}`,
      );

      return this.cachedImageDescriptionConfig;
    } catch (error) {
      log.error(
        `[VibeLearningIndexQueue] Error loading image description config: ${error}`,
      );
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

  /**
   * 从 setting.json 读取文档摘要 LLM 配置
   */
  private async getDocSummaryConfig(): Promise<DocSummaryConfig | null> {
    if (this.cachedDocSummaryConfig !== undefined) {
      return this.cachedDocSummaryConfig;
    }

    try {
      const settingPath = join(PathUtil.getAppDir(), "setting.json");
      const settingContent = await fs.readFile(settingPath, "utf-8");
      const setting: SettingForDocSummary = JSON.parse(settingContent);

      const { llmUsageSettings, llmConfigs } = setting;

      const docSummaryUsage = llmUsageSettings?.vibeLearningDocSummary;
      if (!docSummaryUsage?.providerId || !llmConfigs) {
        this.cachedDocSummaryConfig = null;
        return null;
      }

      const llmConfig = llmConfigs.find(
        (c) => c.id === docSummaryUsage.providerId,
      );
      if (!llmConfig) {
        this.cachedDocSummaryConfig = null;
        return null;
      }

      this.cachedDocSummaryConfig = {
        llmProvider: "openai",
        llmApiKey: llmConfig.apiKey,
        llmModel: docSummaryUsage.modelName,
        llmBaseUrl: llmConfig.baseUrl,
      };

      log.info(
        `[VibeLearningIndexQueue] Loaded doc summary config: model=${docSummaryUsage.modelName}, baseUrl=${llmConfig.baseUrl}`,
      );

      return this.cachedDocSummaryConfig;
    } catch (error) {
      log.error(
        `[VibeLearningIndexQueue] Error loading doc summary config: ${error}`,
      );
      this.cachedDocSummaryConfig = null;
      return null;
    }
  }

  /**
   * 清除文档摘要配置缓存
   */
  clearDocSummaryConfigCache(): void {
    this.cachedDocSummaryConfig = undefined;
    log.info("[VibeLearningIndexQueue] Cleared doc summary config cache");
  }

  async init() {
    // 注册 IPC 处理器
    ipcMain.handle("vl-add-index-task", async (_event, params) => {
      return this.addTask(params);
    });

    ipcMain.handle("vl-get-queue-status", async () => {
      return this.getQueueStatus();
    });

    ipcMain.handle(
      "vl-get-resource-status",
      async (_event, resourceId: number) => {
        return this.getResourceStatus(resourceId);
      },
    );

    ipcMain.handle(
      "vl-get-resource-statuses",
      async (_event, resourceIds: number[]) => {
        return this.getResourceStatuses(resourceIds);
      },
    );

    ipcMain.handle(
      "vl-check-markdown-exists",
      async (_event, relativePath: string) => {
        return this.checkMarkdownExists(relativePath);
      },
    );

    ipcMain.handle("vl-search-content", async (_event, params) => {
      return this.searchContent(params);
    });

    ipcMain.handle(
      "vl-rebuild-after-embedding-switch",
      async (_event, params: RebuildQueueForEmbeddingSwitchParams) => {
        return this.rebuildQueueForEmbeddingSwitch(params);
      },
    );

    // 重建所有项目的向量表（维度变化时调用）
    ipcMain.handle(
      "vl-reinit-all-vec-tables",
      async (_event, dimensions: number) => {
        return this.reinitAllVecTables(dimensions);
      },
    );

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
        `[VibeLearningIndexQueue] Cleared media processing cache: files=${result.removedFiles}, bytes=${result.removedBytes}`,
      );
      return result;
    });

    // 读取 Markdown 完整内容
    ipcMain.handle(
      "vl-read-markdown-content",
      async (
        _event,
        params: { projectId: number; resourceName: string; mainDbName: string },
      ) => {
        return this.readMarkdownContent(params);
      },
    );

    // 按行范围读取 Markdown 内容
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
        },
      ) => {
        return this.readMarkdownRange(params);
      },
    );

    // 读取章节内容
    ipcMain.handle(
      "vl-read-chapter-content",
      async (
        _event,
        params: {
          projectId: number;
          resourceName: string;
          mainDbName: string;
          chapterIndex: number;
        },
      ) => {
        return this.readChapterContent(params);
      },
    );

    ipcMain.handle(
      "vl-read-search-hit-context",
      async (
        _event,
        params: {
          projectId: number;
          resourceName: string;
          mainDbName: string;
          chunkIndex: number;
          radius?: number;
        },
      ) => {
        return this.readSearchHitContext(params);
      },
    );

    ipcMain.handle(
      "vl-read-chapter-range",
      async (
        _event,
        params: {
          projectId: number;
          resourceName: string;
          mainDbName: string;
          chapterIndex: number;
          startLine: number;
          endLine: number;
        },
      ) => {
        return this.readChapterRange(params);
      },
    );

    // 列出资源的所有章节
    ipcMain.handle(
      "vl-list-chapters",
      async (
        _event,
        params: {
          projectId: number;
          resourceName: string;
          mainDbName: string;
        },
      ) => {
        return this.listChapters(params);
      },
    );

    // 深度阅读资源
    ipcMain.handle(
      "vl-deep-read-resource",
      async (
        _event,
        params: {
          projectId: number;
          resourceName: string;
          mainDbName: string;
          question: string;
          focusChapters?: number[];
        },
      ) => {
        return this.deepReadResource(params);
      },
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
        },
      ) => {
        return this.deleteResourceComplete(params);
      },
    );

    // 监听状态变更并通知所有窗口
    this.on(
      "status-change",
      (resourceId: number, status: TaskStatus, error?: string) => {
        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) {
            win.webContents.send("vibe-learning-status-change", {
              resourceId,
              status,
              error,
            });
          }
        });
      },
    );

    log.info("[VibeLearningIndexQueue] Module initialized");
  }

  private isTaskStale(
    task: Pick<IndexTask, "resourceId" | "generation">,
  ): boolean {
    return task.generation !== this.queueGeneration;
  }

  private throwIfTaskStale(
    task: Pick<IndexTask, "resourceId" | "generation">,
    stage: string,
  ): void {
    if (!this.isTaskStale(task)) {
      return;
    }

    log.info(
      `[VibeLearningIndexQueue] Skip stale task at ${stage}: resource ${task.resourceId}, task generation ${task.generation}, current generation ${this.queueGeneration}`,
    );
    throw new VibeLearningTaskStaleError(
      task.resourceId,
      task.generation,
      this.queueGeneration,
    );
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
    const droppedPending = this.queue.filter(
      (task) => task.status === "pending",
    ).length;

    this.queue = [];
    this.processingStatus.clear();
    this.taskProgressMap.clear();

    return { droppedPending };
  }

  private getCurrentGenerationQueuedCount(): number {
    return this.queue.filter((task) => task.generation === this.queueGeneration)
      .length;
  }

  async rebuildQueueForEmbeddingSwitch(
    params: RebuildQueueForEmbeddingSwitchParams,
  ): Promise<RebuildQueueForEmbeddingSwitchResult> {
    const reason = params.reason || "model_switch";
    const targetDimensions = Math.floor(params.dimensions);
    const targetDbName =
      params.mainDbName || databaseModule.getCurrentDatabaseName();
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
      `[VibeLearningIndexQueue] Abort current run, generation=${this.queueGeneration}, droppedPending=${droppedPending}`,
    );
  }

  async handleEmbeddingSwitchByPolicy(
    params: HandleEmbeddingSwitchByPolicyParams,
  ): Promise<HandleEmbeddingSwitchByPolicyResult> {
    const previousGeneration = this.queueGeneration;
    this.queueGeneration += 1;
    const currentGeneration = this.queueGeneration;
    const { droppedPending } = this.clearQueueForNewGeneration();

    log.info(
      `[VibeLearningIndexQueue] Handle embedding switch by policy: reason=${params.reason}, provider=${params.providerType}, dimensions=${params.dimensions}, fingerprintChanged=${params.fingerprintChanged}, generation=${previousGeneration}->${currentGeneration}, droppedPending=${droppedPending}`,
    );

    if (!Number.isFinite(params.dimensions) || params.dimensions <= 0) {
      log.warn(
        `[VibeLearningIndexQueue] Invalid dimensions for queue rebuild: ${params.dimensions}`,
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
      reinitOk = await this.reinitAllVecTables(
        Math.floor(params.dimensions),
        params.mainDbName,
      );
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
    BrowserWindow.getAllWindows().forEach((win) => {
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
    taskProgress?: TaskProgress,
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
  addTask(
    task: Omit<IndexTask, "status" | "retryCount" | "generation">,
  ): AddTaskResult {
    // 检查是否已存在相同资源的任务
    const existingTask = this.queue.find(
      (t) => t.resourceId === task.resourceId,
    );

    if (existingTask) {
      if (existingTask.status !== "pending") {
        log.info(
          `[VibeLearningIndexQueue] Skip duplicate task for running resource ${task.resourceId}, currentStatus=${existingTask.status}`,
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
        `[VibeLearningIndexQueue] Updated pending task for resource ${task.resourceId}, type: ${task.type}`,
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
        `[VibeLearningIndexQueue] Added task for resource ${task.resourceId}, type: ${task.type}`,
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
    resourceIds: number[],
  ): Record<
    number,
    { status: TaskStatus | null; taskProgress?: TaskProgress }
  > {
    const result: Record<
      number,
      { status: TaskStatus | null; taskProgress?: TaskProgress }
    > = {};

    for (const resourceId of resourceIds) {
      const status = this.getResourceStatus(resourceId);
      const progressEntry = this.taskProgressMap.get(resourceId);
      result[resourceId] = {
        status,
        ...(status &&
        progressEntry &&
        progressEntry.status === status &&
        progressEntry.taskProgress
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
    const pending = this.queue.filter((t) => t.status === "pending").length;
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
      while (
        this.queue.length > 0 &&
        this.activeTaskCount < this.maxConcurrency
      ) {
        const task = this.queue.find((t) => t.status === "pending");
        if (!task) break;

        task.status = "converting";
        this.activeTaskCount++;

        // 异步处理任务
        this.processTask(task)
          .catch((error) => {
            log.error(
              `[VibeLearningIndexQueue] Task failed for resource ${task.resourceId}: ${error}`,
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
    const {
      resourceId,
      projectId,
      mainDbName,
      originalPath,
      resourceName,
      type,
    } = task;

    try {
      let markdownContent: string | null = null;
      let markdownPath = task.markdownPath;

      this.throwIfTaskStale(task, "task_start");

      // 获取资源信息以检查 sourceType
      const db = databaseModule.getDatabase(mainDbName);
      const resource = db
        ? VibeLearningResourceTable.getResourceById(db, resourceId)
        : null;
      const sourceType = resource?.sourceType;
      const sourceMetaInfo = resource?.sourceMetaInfo;

      // 转换阶段
      if (type === "full" || type === "convert_only") {
        // 检查是否是来自笔记的资源
        if (sourceType === "note" && sourceMetaInfo) {
          markdownContent = await this.processNoteResource(
            resourceId,
            sourceMetaInfo,
            mainDbName,
          );
        } else if (sourceType === "bilibili" && sourceMetaInfo) {
          // Bilibili 视频
          markdownContent = await this.processBilibiliVideo(
            resourceId,
            sourceMetaInfo,
            resourceName,
            mainDbName,
          );
        } else if (sourceType === "youtube" && sourceMetaInfo) {
          // YouTube 视频
          markdownContent = await this.processYoutubeVideo(
            resourceId,
            sourceMetaInfo,
            resourceName,
            mainDbName,
            originalPath,
          );
        } else {
          // 普通资源处理流程
          log.info(
            `[VibeLearningIndexQueue] Converting resource ${resourceId}`,
          );

          // 如果是远程 URL，先下载到本地
          let localFilePath = originalPath;
          let needCleanup = false;

          if (this.isRemoteUrl(originalPath)) {
            this.processingStatus.set(resourceId, "downloading");
            this.emit("status-change", resourceId, "downloading");
            log.info(
              `[VibeLearningIndexQueue] Downloading remote file: ${originalPath}`,
            );
            localFilePath = await this.downloadRemoteFile(originalPath);
            needCleanup = true;
            log.info(
              `[VibeLearningIndexQueue] Downloaded to: ${localFilePath}`,
            );
          } else if (localFilePath.startsWith("~")) {
            localFilePath = localFilePath.replace(/^~/, os.homedir());
            log.info(
              `[VibeLearningIndexQueue] Expanded ~ path to: ${localFilePath}`,
            );
          }

          try {
            // 检查是否为媒体文件（视频/音频），走统一媒体处理管线
            if (this.isMediaFile(localFilePath)) {
              const sourceStableId = await this.buildSourceStableId(
                originalPath,
                localFilePath,
              );
              markdownContent = await this.processMediaResource(
                localFilePath,
                resourceId,
                resourceName,
                mainDbName,
                sourceStableId,
              );
            } else {
              // 非媒体文件走 MarkItDown（PDF、Word、PPT 等）
              this.processingStatus.set(resourceId, "converting");
              this.emit("status-change", resourceId, "converting");

              const imageDescConfig = await this.getImageDescriptionConfig();

              const result = await markitdownModule.convertFile({
                filePath: localFilePath,
                fileName: originalPath.split("/").pop() || "file",
                llmProvider: imageDescConfig?.llmProvider,
                llmApiKey: imageDescConfig?.llmApiKey,
                llmModel: imageDescConfig?.llmModel,
                llmBaseUrl: imageDescConfig?.llmBaseUrl,
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
                log.info(
                  `[VibeLearningIndexQueue] Cleaned up temp file: ${localFilePath}`,
                );
              } catch (e) {
                log.warn(
                  `[VibeLearningIndexQueue] Failed to cleanup temp file: ${e}`,
                );
              }
            }
          }
        }

        // 保存 Markdown 文件（长文档触发 AI 章节拆分）
        if (markdownContent.length > 50000) {
          const docSummaryConfig = await this.getDocSummaryConfig();

          let chapters: Chapter[];
          let summaryContent: string;

          if (docSummaryConfig) {
            // AI 驱动的章节拆分
            this.processingStatus.set(resourceId, "summarizing");
            this.emit("status-change", resourceId, "summarizing");

            log.info(
              `[VibeLearningIndexQueue] Large document detected (${markdownContent.length} chars), starting AI chapter split for "${resourceName}" with model=${docSummaryConfig.llmModel}, baseURL=${docSummaryConfig.llmBaseUrl || "default"}`,
            );

            const result = await splitMarkdownByAI(
              markdownContent,
              {
                llmApiKey: docSummaryConfig.llmApiKey,
                llmModel: docSummaryConfig.llmModel,
                llmBaseUrl: docSummaryConfig.llmBaseUrl,
              },
              resourceName,
              (chunkProgress) => {
                this.sendStatusWithProgress(
                  resourceId,
                  "summarizing",
                  chunkProgress,
                );
              },
            );
            chapters = result.chapters;
            summaryContent = result.summaryContent;
          } else {
            // 降级：简单标题拆分（无 LLM 配置）
            log.info(
              `[VibeLearningIndexQueue] No LLM config, using simple heading split for ${markdownContent.length} chars`,
            );
            chapters = simpleSplitByHeadings(markdownContent);
            summaryContent = generateSummaryIndex(resourceName, chapters);
          }

          log.info(
            `[VibeLearningIndexQueue] Split into ${chapters.length} chapters`,
          );

          // 保存摘要文件
          markdownPath = await this.saveMarkdown(
            mainDbName,
            projectId,
            resourceId,
            resourceName,
            summaryContent,
          );

          // 保存各章节文件
          await this.saveChapterFiles(markdownPath, chapters);

          // 更新 DB: is_chunked=1, chapter_count=N
          const dbForChunk = databaseModule.getDatabase(mainDbName);
          if (dbForChunk) {
            VibeLearningResourceTable.updateChunkInfo(
              dbForChunk,
              resourceId,
              true,
              chapters.length,
            );
          }

          log.info(
            `[VibeLearningIndexQueue] Saved ${chapters.length} chapter files for resource ${resourceId}`,
          );
        } else {
          // 小文档：直接保存
          markdownPath = await this.saveMarkdown(
            mainDbName,
            projectId,
            resourceId,
            resourceName,
            markdownContent,
          );
        }

        log.info(
          `[VibeLearningIndexQueue] Saved markdown for resource ${resourceId}: ${markdownPath}`,
        );

        // 更新数据库中的 markdown_path
        await this.updateResourceMarkdownPath(
          mainDbName,
          resourceId,
          markdownPath,
        );
        log.info(
          `[VibeLearningIndexQueue] Updated markdown path in database for resource ${resourceId}`,
        );
      }

      // 索引阶段
      if (type === "full" || type === "index_only") {
        this.throwIfTaskStale(task, "before_indexing");
        this.processingStatus.set(resourceId, "indexing");
        this.emit("status-change", resourceId, "indexing");

        log.info(`[VibeLearningIndexQueue] Indexing resource ${resourceId}`);

        // 检查是否是分章文档
        const dbForIndex = databaseModule.getDatabase(mainDbName);
        const resourceForIndex = dbForIndex
          ? VibeLearningResourceTable.getResourceById(dbForIndex, resourceId)
          : null;

        if (resourceForIndex?.isChunked && markdownPath) {
          // 分章文档：逐章节索引
          const chaptersDir = this.getChaptersDirFromMarkdownPath(markdownPath);
          const chapterCount = resourceForIndex.chapterCount;

          // 先索引摘要文件
          const summaryPath = this.getAbsoluteMarkdownPath(markdownPath);
          const summaryContent = await fs.readFile(summaryPath, "utf-8");
          await this.createIndex(
            mainDbName,
            projectId,
            resourceId,
            summaryContent,
            0, // chapterOffset=0 for summary
          );

          // 逐章节索引
          const absoluteChaptersDir = this.getAbsoluteMarkdownPath(chaptersDir);
          const sortedChapterFiles =
            await listChapterFilesSorted(absoluteChaptersDir);
          const totalIndexItems = sortedChapterFiles.length + 1; // +1 摘要

          // 上报摘要索引完成
          this.sendStatusWithProgress(resourceId, "indexing", {
            total: totalIndexItems,
            completed: 1,
            failed: 0,
            inProgress: 1,
          });

          for (let i = 0; i < sortedChapterFiles.length; i++) {
            const chapterFile = join(
              absoluteChaptersDir,
              sortedChapterFiles[i],
            );
            try {
              const chapterContent = await fs.readFile(chapterFile, "utf-8");
              const chapterOffset = (i + 1) * 10000;
              await this.createIndex(
                mainDbName,
                projectId,
                resourceId,
                chapterContent,
                chapterOffset,
                task,
              );
            } catch (e) {
              log.warn(
                `[VibeLearningIndexQueue] Failed to index chapter ${i}: ${e}`,
              );
            }

            // 上报章节级进度
            this.sendStatusWithProgress(resourceId, "indexing", {
              total: totalIndexItems,
              completed: i + 2, // +2: 摘要(1) + 已完成章节(i+1)
              failed: 0,
              inProgress: i + 2 < totalIndexItems ? 1 : 0,
            });
          }

          log.info(
            `[VibeLearningIndexQueue] Indexed ${chapterCount} chapters for resource ${resourceId}`,
          );
        } else {
          // 小文档：原有逻辑
          if (!markdownContent && markdownPath) {
            const absolutePath = this.getAbsoluteMarkdownPath(markdownPath);
            markdownContent = await fs.readFile(absolutePath, "utf-8");
          }

          if (!markdownContent) {
            throw new Error("No markdown content to index");
          }

          await this.createIndex(
            mainDbName,
            projectId,
            resourceId,
            markdownContent,
            undefined,
            task,
          );
        }

        log.info(`[VibeLearningIndexQueue] Indexed resource ${resourceId}`);
      }

      // 仅 embedding 阶段（已有 FTS 索引但缺少向量索引）
      if (type === "embedding_only") {
        this.throwIfTaskStale(task, "before_embedding");
        this.processingStatus.set(resourceId, "embedding");
        this.emit("status-change", resourceId, "embedding");

        log.info(
          `[VibeLearningIndexQueue] Generating embedding for resource ${resourceId}`,
        );

        // 从文件读取 markdown 内容
        if (!markdownContent && markdownPath) {
          const absolutePath = this.getAbsoluteMarkdownPath(markdownPath);
          markdownContent = await fs.readFile(absolutePath, "utf-8");
        }

        if (!markdownContent) {
          throw new Error("No markdown content for embedding");
        }

        // 仅生成 embedding
        await this.createEmbeddingOnly(
          mainDbName,
          projectId,
          resourceId,
          markdownContent,
          task,
        );

        log.info(
          `[VibeLearningIndexQueue] Generated embedding for resource ${resourceId}`,
        );
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

      log.info(
        `[VibeLearningIndexQueue] Completed task for resource ${resourceId}`,
      );
    } catch (error) {
      if (this.isTaskStaleError(error)) {
        this.processingStatus.delete(resourceId);
        this.taskProgressMap.delete(resourceId);
        return;
      }

      const errorMessage = getFriendlyPythonRuntimeErrorMessage(
        error,
        "任务执行失败",
      );

      // 重试逻辑
      if (task.retryCount < 2) {
        task.retryCount++;
        task.status = "pending";
        log.warn(
          `[VibeLearningIndexQueue] Retrying task for resource ${resourceId}, attempt ${task.retryCount}`,
        );
        return;
      }

      // 标记为失败
      this.processingStatus.set(resourceId, "failed");
      this.taskProgressMap.delete(resourceId);
      this.emit("status-change", resourceId, "failed", errorMessage);

      log.error(
        `[VibeLearningIndexQueue] Task failed for resource ${resourceId}: ${errorMessage}`,
      );
    }
  }

  private async processNoteResource(
    resourceId: number,
    sourceMetaInfo: string,
    mainDbName: string,
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
      `[VibeLearningIndexQueue] Processing note resource: contentId=${contentId}, type=${type}, title=${title}`,
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
      `[VibeLearningIndexQueue] Note resource processed successfully: resourceId=${resourceId}, contentLength=${markdown.length}`,
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
    mainDbName: string,
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
      `[VibeLearningIndexQueue] Processing Bilibili video: ${bvid}-${cid}, quality: ${quality}`,
    );
    const credentials = await this.getBilibiliCredentials();

    // 1. 获取本地视频文件路径（检查缓存或下载）
    let localVideoPath: string | null = null;
    const cacheStatus = await getBilibiliCacheStatus(bvid, cid, quality);

    if (cacheStatus?.localPath) {
      log.info(
        `[VibeLearningIndexQueue] Using cached video: ${cacheStatus.localPath}`,
      );
      localVideoPath = cacheStatus.localPath;
    } else {
      // 下载视频
      this.processingStatus.set(resourceId, "downloading");
      this.emit("status-change", resourceId, "downloading");

      log.info(`[VibeLearningIndexQueue] Downloading Bilibili video...`);

      const playUrl = await this.getBilibiliPlayUrl(
        bvid,
        cid,
        quality,
        credentials,
      );
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
      log.info(
        `[VibeLearningIndexQueue] Video downloaded to: ${localVideoPath}`,
      );
    }

    // 2. 走统一媒体处理管线
    return this.processMediaResource(
      localVideoPath,
      resourceId,
      title || resourceName,
      mainDbName,
      `bilibili:${bvid}:${cid}:${quality}`,
      `https://www.bilibili.com/video/${bvid}`,
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
    fallbackUrl?: string,
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
      log.info(
        `[VibeLearningIndexQueue] Using cached YouTube video: ${cacheStatus.localPath}`,
      );
      localVideoPath = cacheStatus.localPath;
    } else {
      this.processingStatus.set(resourceId, "downloading");
      this.emit("status-change", resourceId, "downloading");
      log.info(`[VibeLearningIndexQueue] Downloading YouTube video...`);

      const info = await YtDlpService.fetchVideoInfo(sourceUrl, proxy);
      if (!info.videoStreams?.length || !info.audioStreams?.length) {
        throw new Error("未找到可用的 YouTube 音视频流");
      }

      const videoStream = this.selectYoutubeVideoStream(
        info.videoStreams,
        meta.videoStream,
      );
      const audioStream = this.selectYoutubeAudioStream(
        info.audioStreams,
        meta.audioStream,
      );
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
      log.info(
        `[VibeLearningIndexQueue] YouTube video downloaded to: ${localVideoPath}`,
      );
    }

    return this.processMediaResource(
      localVideoPath,
      resourceId,
      meta.title || resourceName,
      mainDbName,
      `youtube:${sourceUrl}`,
      sourceUrl,
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
      log.warn(
        `[VibeLearningIndexQueue] Failed to read Bilibili credentials: ${error}`,
      );
      return {};
    }
  }

  private selectYoutubeVideoStream(
    streams: StreamOption[],
    preferredId?: string,
  ): StreamOption | null {
    if (preferredId) {
      const matched = streams.find((stream) => stream.id === preferredId);
      if (matched) {
        return matched;
      }
    }

    const getResolution = (resolution?: string): number => {
      const match = resolution?.match(/(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    };

    const sorted = [...streams].sort((a, b) => {
      const resolutionDiff =
        getResolution(b.resolution) - getResolution(a.resolution);
      if (resolutionDiff !== 0) return resolutionDiff;
      const fpsDiff = (b.fps || 0) - (a.fps || 0);
      if (fpsDiff !== 0) return fpsDiff;
      return (b.bitrate || 0) - (a.bitrate || 0);
    });

    return sorted[0] || null;
  }

  private selectYoutubeAudioStream(
    streams: StreamOption[],
    preferredId?: string,
  ): StreamOption | null {
    if (preferredId) {
      const matched = streams.find((stream) => stream.id === preferredId);
      if (matched) {
        return matched;
      }
    }

    const sorted = [...streams].sort(
      (a, b) => (b.bitrate || 0) - (a.bitrate || 0),
    );
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
      log.warn(
        `[VibeLearningIndexQueue] Failed to read YouTube proxy settings: ${error}`,
      );
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
    credentials: BilibiliCredentialsConfig,
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
        { headers },
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
        log.error(
          `[VibeLearningIndexQueue] Failed to get play URL: ${JSON.stringify(data)}`,
        );
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
    videoUrl?: string,
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
  private parseTranscriptLines(
    output: string,
  ): Array<{ text: string; start: number }> {
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const match = line.match(/^(\d+):([0-5]\d)\.(\d{3}):(.+)$/);
        if (!match) return null;
        const start =
          parseInt(match[1]) * 60000 +
          parseInt(match[2]) * 1000 +
          parseInt(match[3]);
        return { text: match[4].trim(), start };
      })
      .filter((item): item is { text: string; start: number } => item !== null);
  }

  private getOptimizationSegmentTextLength(segment: {
    text: string;
    start: number;
  }): number {
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
    overlapWords: number,
  ): Array<Array<{ text: string; start: number; end: number }>> {
    if (wordSegments.length === 0) {
      return [];
    }

    const chunks: Array<Array<{ text: string; start: number; end: number }>> =
      [];
    let startIndex = 0;

    while (startIndex < wordSegments.length) {
      let endIndex = startIndex;
      let chunkChars = 0;

      while (endIndex < wordSegments.length) {
        const segment = wordSegments[endIndex];
        const segmentLength = this.getOptimizationSegmentTextLength(segment);

        if (
          endIndex > startIndex &&
          chunkChars + segmentLength > chunkMaxChars
        ) {
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
    maxEnd: number,
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
      llmApiKey: string;
      llmModel: string;
      llmBaseUrl?: string;
    },
    onProgress?: (progress: TaskProgress) => void,
  ): Promise<Array<{ text: string; start: number; end: number }>> {
    const chunkMaxChars = 18_000;
    const overlapWords = 80;
    const maxAttempts = 2;
    const client = new OpenAI({
      apiKey: config.llmApiKey,
      baseURL: config.llmBaseUrl,
    });

    log.info(
      `[VibeLearningIndexQueue] Optimizing transcription with LLM: ${wordSegments.length} word segments`,
    );

    try {
      const chunks = this.splitWordSegmentsForOptimization(
        wordSegments,
        chunkMaxChars,
        overlapWords,
      );
      log.info(
        `[VibeLearningIndexQueue] Transcription optimization split into ${chunks.length} chunks (chunkMaxChars=${chunkMaxChars}, overlapWords=${overlapWords})`,
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
          chunks.length > 0
            ? Math.floor(((completed + failed) / chunks.length) * 100)
            : 100;
        log.info(
          `[VibeLearningIndexQueue] Transcription optimization progress snapshot: ${percent}% (completed=${completed}, failed=${failed}, inProgress=${inProgress}, total=${chunks.length})`,
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

        const userPrompt = buildTranscriptionOptimizationUserPrompt(
          chunk,
          language,
        );

        // 模型特殊处理
        const isKimiModel = config.llmModel.startsWith("kimi");
        const noTemperature = ["o1", "o3", "o4", "gpt-5"].some((p) =>
          config.llmModel.startsWith(p),
        );

        let parsedChunk: Array<{ text: string; start: number }> | null = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            log.info(
              `[VibeLearningIndexQueue] Optimizing chunk ${i + 1}/${chunks.length}, attempt=${attempt}, segments=${chunk.length}`,
            );
            const response = await client.chat.completions.create({
              model: config.llmModel,
              messages: [
                {
                  role: "system",
                  content: TRANSCRIPTION_OPTIMIZATION_SYSTEM_PROMPT,
                },
                { role: "user", content: userPrompt },
              ],
              ...(isKimiModel
                ? {
                    temperature: 0.6,
                    top_p: 0.95,
                    thinking: { type: "disabled" },
                  }
                : noTemperature
                  ? {}
                  : { temperature: 0.3 }),
            });
            const content = response.choices[0]?.message?.content || "";
            const parsed = this.parseTranscriptLines(content);

            if (parsed.length === 0) {
              throw new Error("LLM 断句输出为空或无法解析");
            }

            parsedChunk = parsed;
            break;
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            log.warn(
              `[VibeLearningIndexQueue] Chunk ${i + 1}/${chunks.length} attempt ${attempt} failed: ${errorMessage}`,
            );
            if (attempt >= maxAttempts) {
              failed++;
              inProgress = 0;
              reportProgress();
              throw new Error(
                `断句优化失败（chunk ${i + 1}/${chunks.length}，重试 1 次后仍失败）：${errorMessage}`,
              );
            }
            await new Promise((resolve) => setTimeout(resolve, 1000));
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
          `[VibeLearningIndexQueue] Chunk ${i + 1}/${chunks.length} complete in ${chunkElapsedMs}ms, sentences=${parsedChunk.length}`,
        );
        reportProgress();
      }

      // 计算 end 时间：下一句的 start - 1ms，最后一句用词级 segments 的最大 end
      const maxEnd =
        wordSegments.length > 0
          ? wordSegments[wordSegments.length - 1].end
          : 5000;

      const result = this.mergeOptimizedChunks(parsedChunks, maxEnd);

      if (result.length === 0) {
        throw new Error("LLM 转录优化结果为空");
      }

      log.info(
        `[VibeLearningIndexQueue] Transcription optimization complete: ${result.length} sentences`,
      );

      return result;
    } catch (error) {
      log.error(
        `[VibeLearningIndexQueue] Error optimizing transcription: ${error}`,
      );
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
    videoUrl?: string,
  ): Promise<string> {
    const isAudioResource = this.isAudioFile(localFilePath);
    let audioPath = localFilePath;
    let tempAudioPath: string | null = null;

    const mediaFingerprint = await vibeLearningMediaCache
      .computeMediaFingerprint(localFilePath, sourceStableId)
      .catch((error) => {
        log.warn(
          `[VibeLearningIndexQueue] Failed to compute media fingerprint, fallback to path hash: ${error}`,
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
      const cachedAudioPath =
        await vibeLearningMediaCache.getAudioPath(audioKey);

      if (cachedAudioPath) {
        audioPath = cachedAudioPath;
        log.info(
          `[VibeLearningIndexQueue] Hit audio cache for resource ${resourceId}`,
        );
      } else {
        const audioResult =
          await transcriptionModule.extractAudioFromVideo(localFilePath);
        if (!audioResult.success || !audioResult.audioPath) {
          throw new Error(audioResult.error || "提取音频失败");
        }

        tempAudioPath = audioResult.audioPath;
        audioPath = tempAudioPath;

        try {
          audioPath = await vibeLearningMediaCache.cacheAudioFromFile(
            audioKey,
            tempAudioPath,
          );
          log.info(
            `[VibeLearningIndexQueue] Stored audio cache for resource ${resourceId}`,
          );
        } catch (error) {
          log.warn(
            `[VibeLearningIndexQueue] Failed to cache extracted audio, fallback to temp file: ${error}`,
          );
        }
      }
    }

    try {
      // 2. 转录
      this.processingStatus.set(resourceId, "transcribing");
      this.emit("status-change", resourceId, "transcribing");

      const transcriptionConfig = await this.getTranscriptionConfig();
      const hasLLMConfig = !!transcriptionConfig?.llmProvider;

      const modelSize: VLTranscriptionModelSize =
        (transcriptionConfig?.model as VLTranscriptionModelSize) || "base";
      const transcriptionOptions = buildVLTranscriptionOptions(
        modelSize,
        hasLLMConfig,
      );
      const { language, sentenceLevel, useLLMOptimization } =
        transcriptionOptions;

      log.info(
        `[VibeLearningIndexQueue] Transcribing media: model=${modelSize}, hasLLM=${hasLLMConfig}`,
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
        await vibeLearningMediaCache.readTranscription<TranscriptionResult>(
          transcriptionKey,
        );

      if (transcriptionData) {
        log.info(
          `[VibeLearningIndexQueue] Hit transcription cache for resource ${resourceId}`,
        );
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
          },
        );

        if (!transcriptionResult.success || !transcriptionResult.data) {
          throw new Error(transcriptionResult.error || "转录失败");
        }
        transcriptionData = transcriptionResult.data;

        try {
          await vibeLearningMediaCache.writeTranscription(
            transcriptionKey,
            transcriptionData,
          );
        } catch (error) {
          log.warn(
            `[VibeLearningIndexQueue] Failed to write transcription cache: ${error}`,
          );
        }
      }

      // 3. LLM 优化（如果配置了）
      const { text, segments, wordSegments } = transcriptionData;
      const rawSegments = wordSegments || segments || [];
      const optimizationLanguage = resolveVLOptimizationLanguage(
        transcriptionData.language,
      );

      const db = databaseModule.getDatabase(mainDbName);
      if (db && rawSegments.length > 0) {
        VibeLearningResourceTable.updateTranscriptSegments(
          db,
          resourceId,
          rawSegments,
        );
      }

      let finalSegments: Array<{
        text: string;
        start: number;
        end: number;
      }>;

      if (hasLLMConfig && transcriptionConfig) {
        if (rawSegments.length === 0) {
          throw new Error("无可用词级时间戳，无法进行断句优化");
        }

        const optimizationKey = vibeLearningMediaCache.buildOptimizationKey({
          transcriptionKey,
          llmProvider: transcriptionConfig.llmProvider || "openai",
          llmModel: transcriptionConfig.llmModel || "",
          llmBaseUrl: transcriptionConfig.llmBaseUrl || "",
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
          log.info(
            `[VibeLearningIndexQueue] Hit optimization cache for resource ${resourceId}`,
          );
        } else {
          this.processingStatus.set(resourceId, "optimizing_transcript");
          this.emit("status-change", resourceId, "optimizing_transcript");

          finalSegments = await this.optimizeTranscriptionWithLLM(
            rawSegments,
            optimizationLanguage,
            {
              llmApiKey: transcriptionConfig.llmApiKey || "",
              llmModel: transcriptionConfig.llmModel || "",
              llmBaseUrl: transcriptionConfig.llmBaseUrl,
            },
            (progress) => {
              this.sendStatusWithProgress(
                resourceId,
                "optimizing_transcript",
                progress,
              );
            },
          );

          try {
            await vibeLearningMediaCache.writeOptimization(
              optimizationKey,
              finalSegments,
            );
          } catch (error) {
            log.warn(
              `[VibeLearningIndexQueue] Failed to write optimization cache: ${error}`,
            );
          }
        }
      } else {
        finalSegments = segments || rawSegments;
      }

      // 4. 保存 segments 到 DB
      if (db && finalSegments.length > 0) {
        VibeLearningResourceTable.updateTranscriptSegments(
          db,
          resourceId,
          finalSegments,
        );
      }

      // 5. 生成带时间戳的 Markdown
      if (finalSegments.length > 0) {
        return this.formatSegmentsToMarkdown(
          resourceName,
          finalSegments,
          videoUrl,
        );
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
          log.warn(
            `[VibeLearningIndexQueue] Failed to cleanup audio file: ${e}`,
          );
        }
      }
    }
  }

  private async saveMarkdown(
    mainDbName: string,
    projectId: number,
    resourceId: number,
    resourceName: string,
    content: string,
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

  /**
   * 从 markdown_path 推导章节目录路径
   * markdown_path: "vibe-learning/db/1/name-1.md"
   * chapters dir:  "vibe-learning/db/1/name-1-chapters/"
   */
  private getChaptersDirFromMarkdownPath(markdownPath: string): string {
    return markdownPath.replace(/\.md$/, "-chapters");
  }

  /**
   * 保存章节文件到 chapters 目录
   */
  private async saveChapterFiles(
    markdownPath: string,
    chapters: Chapter[],
  ): Promise<void> {
    const chaptersDir = this.getChaptersDirFromMarkdownPath(markdownPath);
    const absoluteChaptersDir = this.getAbsoluteMarkdownPath(chaptersDir);

    await fs.mkdir(absoluteChaptersDir, { recursive: true });

    for (const chapter of chapters) {
      const fileName = buildChapterFileName(chapter.index, chapter.title);
      const filePath = join(absoluteChaptersDir, fileName);
      await fs.writeFile(filePath, chapter.content, "utf-8");
    }
  }

  private async updateResourceMarkdownPath(
    mainDbName: string,
    resourceId: number,
    markdownPath: string,
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
    chapterOffset?: number,
    task?: Pick<IndexTask, "resourceId" | "generation">,
  ): Promise<void> {
    if (task) {
      this.throwIfTaskStale(task, "create_index_start");
    }

    const chunks = smartChunk(content, {
      minLength: 1000,
      maxLength: 2000,
      overlap: 0,
      splitter: "sentence",
    });
    const sectionNodes = buildSectionNodesFromMarkdown(content);
    const chunkLineMap = buildChunkLineMap(content, {
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
      sectionTitle?: string;
      sectionPath?: string[];
      chunkStartLine?: number;
      chunkEndLine?: number;
    }> = [];

    // 如果有 embedding 配置，批量生成向量
    if (embeddingConfig) {
      log.info(
        `[VibeLearningIndexQueue] Generating embeddings for ${chunks.length} chunks`,
      );

      // 批量处理以提高效率，每批最多 10 个，每批最多重试 3 次
      const batchSize = embeddingConfig.batchSize || 8;
      const maxRetries = 3;

      for (let i = 0; i < chunks.length; i += batchSize) {
        if (task) {
          this.throwIfTaskStale(task, "create_index_batch");
        }

        const batchChunks = chunks.slice(i, i + batchSize);
        let batchSuccess = false;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            if (attempt > 0) {
              const delay = 1000 * Math.pow(2, attempt) + Math.random() * 500;
              await new Promise((r) => setTimeout(r, delay));
              log.info(
                `[VibeLearningIndexQueue] Retry embedding batch ${i}, attempt ${attempt + 1}`,
              );
            }

            if (task) {
              this.throwIfTaskStale(task, "create_index_embed");
            }

            const embeddings = await this.embedTexts(
              batchChunks,
              embeddingConfig,
            );

            for (let j = 0; j < batchChunks.length; j++) {
              const chunkText = batchChunks[j];
              const segmented = jieba.cutForSearch(chunkText, true).join(" ");
              const lineRange = chunkLineMap[i + j];
              const sectionContext = lineRange
                ? resolveSectionContextForLineRange(sectionNodes, lineRange)
                : null;
              processedChunks.push({
                text: segmented,
                original: chunkText,
                embedding: embeddings[j],
                searchText: segmented,
                displayText: chunkText,
                sectionTitle: sectionContext?.sectionTitle,
                sectionPath: sectionContext?.sectionPath,
                chunkStartLine: lineRange?.startLine,
                chunkEndLine: lineRange?.endLine,
              });
            }
            batchSuccess = true;
            break;
          } catch (error) {
            log.warn(
              `[VibeLearningIndexQueue] Embedding batch ${i} attempt ${attempt + 1} failed: ${error}`,
            );
          }
        }

        if (!batchSuccess) {
          log.error(
            `[VibeLearningIndexQueue] Embedding batch ${i} failed after ${maxRetries} retries, degrading to FTS only`,
          );
          for (let j = 0; j < batchChunks.length; j++) {
            const chunkText = batchChunks[j];
            const segmented = jieba.cutForSearch(chunkText, true).join(" ");
            const lineRange = chunkLineMap[i + j];
            const sectionContext = lineRange
              ? resolveSectionContextForLineRange(sectionNodes, lineRange)
              : null;
            processedChunks.push({
              text: segmented,
              original: chunkText,
              embedding: undefined,
              searchText: segmented,
              displayText: chunkText,
              sectionTitle: sectionContext?.sectionTitle,
              sectionPath: sectionContext?.sectionPath,
              chunkStartLine: lineRange?.startLine,
              chunkEndLine: lineRange?.endLine,
            });
          }
        }
      }

      log.info(
        `[VibeLearningIndexQueue] Generated embeddings for resource ${resourceId}`,
      );
    } else {
      // 没有 embedding 配置，只创建 FTS 索引
      for (const chunkText of chunks) {
        const segmented = jieba.cutForSearch(chunkText, true).join(" ");
        const lineRange = chunkLineMap[processedChunks.length];
        const sectionContext = lineRange
          ? resolveSectionContextForLineRange(sectionNodes, lineRange)
          : null;
        processedChunks.push({
          text: segmented,
          original: chunkText,
          embedding: undefined,
          searchText: segmented,
          displayText: chunkText,
          sectionTitle: sectionContext?.sectionTitle,
          sectionPath: sectionContext?.sectionPath,
          chunkStartLine: lineRange?.startLine,
          chunkEndLine: lineRange?.endLine,
        });
      }
    }

    // 创建索引
    if (task) {
      this.throwIfTaskStale(task, "create_index_commit");
    }

    vibeLearningDBManager.createIndex(
      mainDbName,
      projectId,
      resourceId,
      content,
      processedChunks,
      chapterOffset,
    );
  }

  private async createEmbeddingOnly(
    mainDbName: string,
    projectId: number,
    resourceId: number,
    content: string,
    task?: Pick<IndexTask, "resourceId" | "generation">,
  ): Promise<void> {
    if (task) {
      this.throwIfTaskStale(task, "embedding_only_start");
    }

    const embeddingConfig = await this.getEmbeddingConfig();
    if (!embeddingConfig) {
      log.warn(
        `[VibeLearningIndexQueue] No embedding config, skipping embedding for resource ${resourceId}`,
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

    log.info(
      `[VibeLearningIndexQueue] Generating embeddings only for ${chunks.length} chunks`,
    );

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
            await new Promise((r) => setTimeout(r, delay));
            log.info(
              `[VibeLearningIndexQueue] Retry embedding-only batch ${i}, attempt ${attempt + 1}`,
            );
          }

          if (task) {
            this.throwIfTaskStale(task, "embedding_only_embed");
          }

          const embeddings = await this.embedTexts(
            batchChunks,
            embeddingConfig,
          );

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
            `[VibeLearningIndexQueue] Embedding-only batch ${i} attempt ${attempt + 1} failed: ${error}`,
          );
        }
      }

      if (batchSuccess) {
        completedBatches++;
      } else {
        failedBatches++;
        log.error(
          `[VibeLearningIndexQueue] Embedding-only batch ${i} failed after ${maxRetries} retries, skipping batch`,
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

    vibeLearningDBManager.addEmbeddingsOnly(
      mainDbName,
      projectId,
      resourceId,
      processedChunks,
    );

    log.info(
      `[VibeLearningIndexQueue] Added embeddings for resource ${resourceId}`,
    );
  }

  private isRemoteUrl(path: string): boolean {
    return path.startsWith("http://") || path.startsWith("https://");
  }

  private async buildSourceStableId(
    originalPath: string,
    localFilePath: string,
  ): Promise<string> {
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
    const audioExtensions = [
      ".mp3",
      ".wav",
      ".flac",
      ".aac",
      ".ogg",
      ".wma",
      ".m4a",
      ".opus",
    ];
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
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
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
      `[VibeLearningIndexQueue] Deleting resource complete: resourceId=${resourceId}, projectId=${projectId}`,
    );

    try {
      // 1. 从队列中移除待处理任务（如果存在）
      const taskIndex = this.queue.findIndex(
        (t) => t.resourceId === resourceId,
      );
      if (taskIndex >= 0) {
        this.queue.splice(taskIndex, 1);
        log.info(
          `[VibeLearningIndexQueue] Removed pending task for resource ${resourceId}`,
        );
      }

      // 清除处理状态
      this.processingStatus.delete(resourceId);

      // 2. 删除 FTS 和向量索引
      try {
        vibeLearningDBManager.removeIndex(mainDbName, projectId, resourceId);
        log.info(
          `[VibeLearningIndexQueue] Removed index for resource ${resourceId}`,
        );
      } catch (error) {
        log.warn(
          `[VibeLearningIndexQueue] Failed to remove index for resource ${resourceId}: ${error}`,
        );
        // 继续执行，不中断删除流程
      }

      // 3. 删除 Markdown 文件
      if (markdownPath) {
        try {
          const absolutePath = this.getAbsoluteMarkdownPath(markdownPath);
          await fs.unlink(absolutePath);
          log.info(
            `[VibeLearningIndexQueue] Deleted markdown file: ${absolutePath}`,
          );
        } catch (error) {
          log.warn(
            `[VibeLearningIndexQueue] Failed to delete markdown file: ${error}`,
          );
          // 继续执行，不中断删除流程
        }

        // 3.1 如果是分章文档，删除章节目录
        const chaptersDir = this.getChaptersDirFromMarkdownPath(markdownPath);
        const absoluteChaptersDir = this.getAbsoluteMarkdownPath(chaptersDir);
        try {
          await fs.rm(absoluteChaptersDir, { recursive: true, force: true });
          log.info(
            `[VibeLearningIndexQueue] Deleted chapters directory: ${absoluteChaptersDir}`,
          );
        } catch (error) {
          // 目录可能不存在（小文档），忽略
        }
      }

      // 4. 删除数据库记录
      const db = databaseModule.getDatabase(mainDbName);
      if (db) {
        VibeLearningResourceTable.deleteResource(db, resourceId);
        log.info(
          `[VibeLearningIndexQueue] Deleted database record for resource ${resourceId}`,
        );
      }

      log.info(
        `[VibeLearningIndexQueue] Successfully deleted resource ${resourceId} completely`,
      );
      return true;
    } catch (error) {
      log.error(
        `[VibeLearningIndexQueue] Error deleting resource complete: ${error}`,
      );
      return false;
    }
  }

  /**
   * 根据资源名称查找资源
   */
  private async findResourceByName(
    mainDbName: string,
    projectId: number,
    resourceName: string,
  ): Promise<{
    id: number;
    markdownPath: string | null;
    name: string;
  } | null> {
    const db = databaseModule.getDatabase(mainDbName);

    if (!db) {
      return null;
    }

    const resources = VibeLearningResourceTable.getResourcesByProjectId(
      db,
      projectId,
    );

    // 精确匹配或模糊匹配
    const exactMatch = resources.find((r) => r.name === resourceName);
    if (exactMatch) {
      return {
        id: exactMatch.id,
        markdownPath: exactMatch.markdownPath,
        name: exactMatch.name,
      };
    }

    // 模糊匹配：忽略大小写和扩展名
    const normalizedName = resourceName.toLowerCase().replace(/\.[^.]+$/, "");
    const fuzzyMatch = resources.find((r) => {
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

  private decodeChunkLocation(chunkIndex: number): DecodedChunkLocation {
    if (chunkIndex >= CHAPTER_CHUNK_OFFSET) {
      return {
        hitType: "chapter",
        chapterIndex: Math.floor(chunkIndex / CHAPTER_CHUNK_OFFSET) - 1,
        chunkIndexInSection: chunkIndex % CHAPTER_CHUNK_OFFSET,
      };
    }

    return {
      hitType: "summary",
      chunkIndexInSection: chunkIndex,
    };
  }

  private buildLexicalQuery(question: string) {
    const normalized = question.trim();
    const regexTokens = normalized
      .toLowerCase()
      .split(/[^\p{L}\p{N}\u4e00-\u9fff]+/u)
      .map((token) => token.trim())
      .filter(Boolean);
    const jiebaTokens = jieba
      .cutForSearch(normalized, true)
      .map((token) => token.trim().toLowerCase())
      .filter((token) => /[\p{L}\p{N}\u4e00-\u9fff]/u.test(token));
    const cjkText = normalized.replace(/[^\u4e00-\u9fff]/g, "");
    const cjkBigrams: string[] = [];
    for (let i = 0; i < cjkText.length - 1; i++) {
      cjkBigrams.push(cjkText.slice(i, i + 2));
    }

    const tokens = Array.from(
      new Set([...regexTokens, ...jiebaTokens, ...cjkBigrams]),
    );

    return {
      raw: question,
      normalized,
      tokens,
      isEmpty: !normalized,
    };
  }

  private parseSummaryIndexContent(summaryContent: string): ChapterOutline[] {
    const legacyOutlines: ChapterOutline[] = [];
    const structuredOutlines: ChapterOutline[] = [];
    const lines = summaryContent.split("\n");
    const legacyPattern =
      /^(\d+)\.\s+(.+?)\s+\((.+),\s*([\d,]+)\s*字符\)(?:\s*-\s*(.+))?$/;
    const structuredHeadingPattern = /^###\s+章节\s+(\d+)\s*$/;
    const fieldPatterns = {
      title: /^- 标题：\s*(.+)$/,
      summary: /^- 摘要：\s*(.+)$/,
      fileName: /^- 文件：\s*(.+)$/,
      charCount: /^- 字数：\s*([\d,]+)\s*字符$/,
    };

    for (const line of lines) {
      const matched = legacyPattern.exec(line.trim());
      if (!matched) {
        continue;
      }

      legacyOutlines.push({
        index: Math.max(0, Number.parseInt(matched[1], 10) - 1),
        title: matched[2].trim(),
        fileName: matched[3].trim(),
        charCount: Number.parseInt(matched[4].replace(/,/g, ""), 10) || 0,
        summary: matched[5]?.trim(),
      });
    }

    let current: Partial<ChapterOutline> | null = null;
    for (const line of lines) {
      const trimmed = line.trim();
      const headingMatch = structuredHeadingPattern.exec(trimmed);
      if (headingMatch) {
        if (current?.index != null && current.title) {
          structuredOutlines.push(current as ChapterOutline);
        }
        current = {
          index: Math.max(0, Number.parseInt(headingMatch[1], 10) - 1),
        };
        continue;
      }

      if (!current) {
        continue;
      }

      const titleMatch = fieldPatterns.title.exec(trimmed);
      if (titleMatch) {
        current.title = titleMatch[1].trim();
        continue;
      }

      const summaryMatch = fieldPatterns.summary.exec(trimmed);
      if (summaryMatch) {
        current.summary = summaryMatch[1].trim();
        continue;
      }

      const fileNameMatch = fieldPatterns.fileName.exec(trimmed);
      if (fileNameMatch) {
        current.fileName = fileNameMatch[1].trim();
        continue;
      }

      const charCountMatch = fieldPatterns.charCount.exec(trimmed);
      if (charCountMatch) {
        current.charCount =
          Number.parseInt(charCountMatch[1].replace(/,/g, ""), 10) || 0;
      }
    }

    if (current?.index != null && current.title) {
      structuredOutlines.push(current as ChapterOutline);
    }

    const merged = new Map<number, ChapterOutline>();
    for (const outline of [...legacyOutlines, ...structuredOutlines]) {
      const existing = merged.get(outline.index);
      merged.set(outline.index, {
        index: outline.index,
        title:
          outline.title || existing?.title || `第 ${outline.index + 1} 部分`,
        summary: outline.summary ?? existing?.summary,
        fileName: outline.fileName ?? existing?.fileName,
        charCount: outline.charCount ?? existing?.charCount,
      });
    }

    return Array.from(merged.values()).sort(
      (left, right) => left.index - right.index,
    );
  }

  private async getChapterOutlines(
    markdownPath: string,
  ): Promise<ChapterOutline[]> {
    const summaryPath = this.getAbsoluteMarkdownPath(markdownPath);
    const summaryContent = await fs.readFile(summaryPath, "utf-8");
    return this.parseSummaryIndexContent(summaryContent);
  }

  private async getChunkedResourceContent(
    markdownPath: string,
    chunkLocation: DecodedChunkLocation,
  ): Promise<{
    content: string;
    chapterTitle?: string;
  }> {
    if (chunkLocation.hitType === "summary") {
      const summaryPath = this.getAbsoluteMarkdownPath(markdownPath);
      return {
        content: await fs.readFile(summaryPath, "utf-8"),
      };
    }

    const chapterIndex = chunkLocation.chapterIndex;
    if (chapterIndex == null || chapterIndex < 0) {
      throw new Error("无法解析章节索引");
    }

    const chaptersDir = this.getChaptersDirFromMarkdownPath(markdownPath);
    const absoluteChaptersDir = this.getAbsoluteMarkdownPath(chaptersDir);
    const sortedFiles = await listChapterFilesSorted(absoluteChaptersDir);
    const chapterFileName = sortedFiles[chapterIndex];

    if (!chapterFileName) {
      throw new Error(`未找到章节 ${chapterIndex} 的文件`);
    }

    const chapterPath = join(absoluteChaptersDir, chapterFileName);
    const content = await fs.readFile(chapterPath, "utf-8");
    const firstLine = content.split("\n")[0] || "";
    const titleMatch = /^#+\s+(.+)$/.exec(firstLine);

    return {
      content,
      chapterTitle: titleMatch?.[1]?.trim(),
    };
  }

  private async buildHitContext(params: {
    markdownPath: string;
    chunkIndex: number;
    radius: number;
  }): Promise<{
    hitType: "summary" | "chapter";
    chapterIndex?: number;
    chapterTitle?: string;
    chunkIndexInSection: number;
    startChunkIndex: number;
    endChunkIndex: number;
    content: string;
  }> {
    const chunkLocation = this.decodeChunkLocation(params.chunkIndex);
    const { content, chapterTitle } = await this.getChunkedResourceContent(
      params.markdownPath,
      chunkLocation,
    );

    const chunks = smartChunk(content, {
      minLength: 1000,
      maxLength: 2000,
      overlap: 0,
      splitter: "sentence",
    });

    const targetIndex = Math.min(
      Math.max(chunkLocation.chunkIndexInSection, 0),
      Math.max(0, chunks.length - 1),
    );
    const startChunkIndex = Math.max(0, targetIndex - params.radius);
    const endChunkIndex = Math.min(
      chunks.length - 1,
      targetIndex + params.radius,
    );

    return {
      hitType: chunkLocation.hitType,
      chapterIndex: chunkLocation.chapterIndex,
      chapterTitle,
      chunkIndexInSection: targetIndex,
      startChunkIndex,
      endChunkIndex,
      content: chunks
        .slice(startChunkIndex, endChunkIndex + 1)
        .join("\n\n---\n\n"),
    };
  }

  private selectRelevantChapterSegments(
    question: string,
    chapterContent: string,
    maxSegments = 3,
  ): string {
    if (chapterContent.length <= 12_000) {
      return chapterContent;
    }

    const chunks = smartChunk(chapterContent, {
      minLength: 2500,
      maxLength: 6000,
      overlap: 200,
      splitter: "sentence",
    });
    const lexicalQuery = this.buildLexicalQuery(question);
    const rankedChunks = chunks
      .map((chunk, index) => ({
        index,
        chunk,
        score: calculateLexicalScore(lexicalQuery, chunk),
      }))
      .sort(
        (left, right) => right.score - left.score || left.index - right.index,
      );

    const selected = rankedChunks
      .slice(0, Math.max(1, maxSegments))
      .sort((left, right) => left.index - right.index)
      .map(
        (item) =>
          `#### 片段 ${item.index + 1}（相关度 ${item.score.toFixed(2)}）\n${item.chunk}`,
      );

    return selected.join("\n\n---\n\n");
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
    isChunked?: boolean;
    chapterCount?: number;
    error?: string;
  }> {
    const { projectId, resourceName, mainDbName } = params;

    try {
      // 查找资源
      const resource = await this.findResourceByName(
        mainDbName,
        projectId,
        resourceName,
      );

      if (!resource) {
        return {
          success: false,
          error: `未找到名为 "${resourceName}" 的资源`,
        };
      }

      if (!resource.markdownPath) {
        return {
          success: false,
          error: `资源 "${resource.name}" 尚未转换为 Markdown`,
        };
      }

      // 检查文件是否存在
      const absolutePath = this.getAbsoluteMarkdownPath(resource.markdownPath);
      const exists = await this.checkMarkdownExists(resource.markdownPath);
      if (!exists) {
        return {
          success: false,
          error: `Markdown 文件不存在，可能需要重新转换`,
        };
      }

      // 获取完整资源信息（包含 isChunked）
      const db = databaseModule.getDatabase(mainDbName);
      const fullResource = db
        ? VibeLearningResourceTable.getResourceById(db, resource.id)
        : null;

      // 读取内容
      const content = await fs.readFile(absolutePath, "utf-8");
      const lines = content.split("\n");

      if (fullResource?.isChunked) {
        // 分章文档：返回摘要内容 + 提示
        return {
          success: true,
          content:
            content +
            "\n\n---\n> 这是大型文档的摘要。使用 `list_resource_chapters` 查看章节列表，使用 `read_resource_chapter` 读取具体章节内容。",
          totalLines: lines.length,
          resourceName: resource.name,
          isChunked: true,
          chapterCount: fullResource.chapterCount,
        };
      }

      // 小文档：原有逻辑
      const maxLength = 100 * 1024;
      const truncatedContent =
        content.length > maxLength
          ? content.slice(0, maxLength) +
            "\n\n... [内容已截断，请使用 read_resource_range 工具分段读取]"
          : content;

      return {
        success: true,
        content: truncatedContent,
        totalLines: lines.length,
        resourceName: resource.name,
        isChunked: false,
        chapterCount: 0,
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

    try {
      // 查找资源
      const resource = await this.findResourceByName(
        mainDbName,
        projectId,
        resourceName,
      );

      if (!resource) {
        return {
          success: false,
          error: `未找到名为 "${resourceName}" 的资源`,
        };
      }

      if (!resource.markdownPath) {
        return {
          success: false,
          error: `资源 "${resource.name}" 尚未转换为 Markdown`,
        };
      }

      // 检查文件是否存在
      const absolutePath = this.getAbsoluteMarkdownPath(resource.markdownPath);
      const exists = await this.checkMarkdownExists(resource.markdownPath);
      if (!exists) {
        return {
          success: false,
          error: `Markdown 文件不存在，可能需要重新转换`,
        };
      }

      // 读取内容
      const content = await fs.readFile(absolutePath, "utf-8");
      const lines = content.split("\n");
      const totalLines = lines.length;

      // 验证行范围
      const validStartLine = Math.max(1, Math.min(startLine, totalLines));
      const validEndLine = Math.max(
        validStartLine,
        Math.min(endLine, totalLines),
      );

      // 提取指定范围的行（行号从 1 开始）
      const selectedLines = lines.slice(validStartLine - 1, validEndLine);
      const rangeContent = selectedLines.join("\n");

      return {
        success: true,
        content: rangeContent,
        startLine: validStartLine,
        endLine: validEndLine,
        totalLines,
        resourceName: resource.name,
      };
    } catch (error) {
      log.error(
        `[VibeLearningIndexQueue] Error reading markdown range: ${error}`,
      );
      return {
        success: false,
        error: `读取失败: ${(error as Error).message}`,
      };
    }
  }

  /**
   * 读取章节内容
   */
  async readChapterContent(params: {
    projectId: number;
    resourceName: string;
    mainDbName: string;
    chapterIndex: number;
  }): Promise<{
    success: boolean;
    content?: string;
    chapterTitle?: string;
    chapterIndex?: number;
    totalChapters?: number;
    resourceName?: string;
    error?: string;
  }> {
    const { projectId, resourceName, mainDbName, chapterIndex } = params;

    try {
      const resource = await this.findResourceByName(
        mainDbName,
        projectId,
        resourceName,
      );

      if (!resource) {
        return {
          success: false,
          error: `未找到名为 "${resourceName}" 的资源`,
        };
      }

      // 获取完整资源信息
      const db = databaseModule.getDatabase(mainDbName);
      const fullResource = db
        ? VibeLearningResourceTable.getResourceById(db, resource.id)
        : null;

      if (!fullResource?.isChunked || !fullResource.markdownPath) {
        return {
          success: false,
          error: `资源 "${resource.name}" 不是分章文档，请使用 read_resource_content 读取`,
        };
      }

      if (chapterIndex < 0 || chapterIndex >= fullResource.chapterCount) {
        return {
          success: false,
          error: `章节索引 ${chapterIndex} 超出范围，有效范围: 0-${fullResource.chapterCount - 1}`,
        };
      }

      const chaptersDir = this.getChaptersDirFromMarkdownPath(
        fullResource.markdownPath,
      );
      const absoluteChaptersDir = this.getAbsoluteMarkdownPath(chaptersDir);
      const sortedFiles = await listChapterFilesSorted(absoluteChaptersDir);

      if (chapterIndex >= sortedFiles.length) {
        return {
          success: false,
          error: `章节文件不存在，索引 ${chapterIndex} 超出文件数量 ${sortedFiles.length}`,
        };
      }

      const chapterFile = join(absoluteChaptersDir, sortedFiles[chapterIndex]);
      const content = await fs.readFile(chapterFile, "utf-8");

      // 提取章节标题（第一行如果是标题）
      const firstLine = content.split("\n")[0] || "";
      const titleMatch = /^#+\s+(.+)$/.exec(firstLine);
      const chapterTitle = titleMatch
        ? titleMatch[1]
        : `第 ${chapterIndex + 1} 章`;

      return {
        success: true,
        content,
        chapterTitle,
        chapterIndex,
        totalChapters: fullResource.chapterCount,
        resourceName: resource.name,
      };
    } catch (error) {
      log.error(`[VibeLearningIndexQueue] Error reading chapter: ${error}`);
      return {
        success: false,
        error: `读取章节失败: ${(error as Error).message}`,
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
    hitType?: "summary" | "chapter";
    chapterIndex?: number;
    chapterTitle?: string;
    chunkIndex?: number;
    chunkIndexInSection?: number;
    startChunkIndex?: number;
    endChunkIndex?: number;
    content?: string;
    error?: string;
  }> {
    const { projectId, resourceName, mainDbName, chunkIndex } = params;
    const radius = Math.min(
      MAX_HIT_CONTEXT_RADIUS,
      Math.max(1, Math.floor(params.radius || 1)),
    );

    try {
      const resource = await this.findResourceByName(
        mainDbName,
        projectId,
        resourceName,
      );

      if (!resource) {
        return {
          success: false,
          error: `未找到名为 "${resourceName}" 的资源`,
        };
      }

      if (!resource.markdownPath) {
        return {
          success: false,
          error: `资源 "${resource.name}" 尚未转换为 Markdown`,
        };
      }

      const db = databaseModule.getDatabase(mainDbName);
      const fullResource = db
        ? VibeLearningResourceTable.getResourceById(db, resource.id)
        : null;

      if (!fullResource) {
        return {
          success: false,
          error: `未找到资源 "${resource.name}" 的完整元信息`,
        };
      }

      if (!fullResource.markdownPath) {
        return {
          success: false,
          error: `资源 "${resource.name}" 尚未生成 Markdown`,
        };
      }

      if (!fullResource.isChunked) {
        const absolutePath = this.getAbsoluteMarkdownPath(
          fullResource.markdownPath,
        );
        const content = await fs.readFile(absolutePath, "utf-8");
        const chunks = smartChunk(content, {
          minLength: 1000,
          maxLength: 2000,
          overlap: 0,
          splitter: "sentence",
        });
        const targetIndex = Math.min(
          Math.max(chunkIndex, 0),
          Math.max(0, chunks.length - 1),
        );
        const startChunkIndex = Math.max(0, targetIndex - radius);
        const endChunkIndex = Math.min(chunks.length - 1, targetIndex + radius);

        return {
          success: true,
          resourceName: resource.name,
          chunkIndex,
          chunkIndexInSection: targetIndex,
          startChunkIndex,
          endChunkIndex,
          content: chunks
            .slice(startChunkIndex, endChunkIndex + 1)
            .join("\n\n---\n\n"),
        };
      }

      const context = await this.buildHitContext({
        markdownPath: fullResource.markdownPath!,
        chunkIndex,
        radius,
      });

      return {
        success: true,
        resourceName: resource.name,
        hitType: context.hitType,
        chapterIndex: context.chapterIndex,
        chapterTitle: context.chapterTitle,
        chunkIndex,
        chunkIndexInSection: context.chunkIndexInSection,
        startChunkIndex: context.startChunkIndex,
        endChunkIndex: context.endChunkIndex,
        content: context.content,
      };
    } catch (error) {
      log.error(
        `[VibeLearningIndexQueue] Error reading search hit context: ${error}`,
      );
      return {
        success: false,
        error: `读取命中上下文失败: ${(error as Error).message}`,
      };
    }
  }

  async readChapterRange(params: {
    projectId: number;
    resourceName: string;
    mainDbName: string;
    chapterIndex: number;
    startLine: number;
    endLine: number;
  }): Promise<{
    success: boolean;
    content?: string;
    chapterTitle?: string;
    chapterIndex?: number;
    startLine?: number;
    endLine?: number;
    totalLines?: number;
    resourceName?: string;
    error?: string;
  }> {
    const {
      projectId,
      resourceName,
      mainDbName,
      chapterIndex,
      startLine,
      endLine,
    } = params;

    try {
      const chapterResult = await this.readChapterContent({
        projectId,
        resourceName,
        mainDbName,
        chapterIndex,
      });

      if (!chapterResult.success || !chapterResult.content) {
        return {
          success: false,
          error: chapterResult.error,
        };
      }

      const lines = chapterResult.content.split("\n");
      const totalLines = lines.length;
      const validStartLine = Math.max(1, Math.min(startLine, totalLines));
      const validEndLine = Math.max(
        validStartLine,
        Math.min(endLine, totalLines),
      );

      return {
        success: true,
        resourceName: chapterResult.resourceName,
        chapterTitle: chapterResult.chapterTitle,
        chapterIndex,
        startLine: validStartLine,
        endLine: validEndLine,
        totalLines,
        content: lines.slice(validStartLine - 1, validEndLine).join("\n"),
      };
    } catch (error) {
      log.error(
        `[VibeLearningIndexQueue] Error reading chapter range: ${error}`,
      );
      return {
        success: false,
        error: `读取章节片段失败: ${(error as Error).message}`,
      };
    }
  }

  /**
   * 列出资源的所有章节
   */
  async listChapters(params: {
    projectId: number;
    resourceName: string;
    mainDbName: string;
  }): Promise<{
    success: boolean;
    chapters?: Array<{
      index: number;
      title: string;
      charCount: number;
      summary?: string;
    }>;
    resourceName?: string;
    error?: string;
  }> {
    const { projectId, resourceName, mainDbName } = params;

    try {
      const resource = await this.findResourceByName(
        mainDbName,
        projectId,
        resourceName,
      );

      if (!resource) {
        return {
          success: false,
          error: `未找到名为 "${resourceName}" 的资源`,
        };
      }

      const db = databaseModule.getDatabase(mainDbName);
      const fullResource = db
        ? VibeLearningResourceTable.getResourceById(db, resource.id)
        : null;

      if (!fullResource?.isChunked || !fullResource.markdownPath) {
        return {
          success: false,
          error: `资源 "${resource.name}" 不是分章文档`,
        };
      }

      const chaptersDir = this.getChaptersDirFromMarkdownPath(
        fullResource.markdownPath,
      );
      const absoluteChaptersDir = this.getAbsoluteMarkdownPath(chaptersDir);
      const sortedFiles = await listChapterFilesSorted(absoluteChaptersDir);

      const chapters: Array<{
        index: number;
        title: string;
        charCount: number;
        summary?: string;
      }> = [];
      const outlines = await this.getChapterOutlines(fullResource.markdownPath);

      for (let i = 0; i < sortedFiles.length; i++) {
        const chapterFile = join(absoluteChaptersDir, sortedFiles[i]);
        const outline = outlines.find((item) => item.index === i);
        try {
          const content = await fs.readFile(chapterFile, "utf-8");
          const firstLine = content.split("\n")[0] || "";
          const titleMatch = /^#+\s+(.+)$/.exec(firstLine);
          chapters.push({
            index: i,
            title:
              outline?.title ||
              (titleMatch ? titleMatch[1] : `第 ${i + 1} 部分`),
            charCount: content.length,
            summary: outline?.summary,
          });
        } catch {
          chapters.push({
            index: i,
            title: outline?.title || `第 ${i + 1} 部分`,
            charCount: outline?.charCount || 0,
            summary: outline?.summary,
          });
        }
      }

      return {
        success: true,
        chapters,
        resourceName: resource.name,
      };
    } catch (error) {
      log.error(`[VibeLearningIndexQueue] Error listing chapters: ${error}`);
      return {
        success: false,
        error: `列出章节失败: ${(error as Error).message}`,
      };
    }
  }

  /**
   * 深度阅读资源（多轮 LLM 分析）
   */
  async deepReadResource(params: {
    projectId: number;
    resourceName: string;
    mainDbName: string;
    question: string;
    focusChapters?: number[];
  }): Promise<{
    success: boolean;
    answer?: string;
    analyzedChapters?: number[];
    error?: string;
  }> {
    const { projectId, resourceName, mainDbName, question, focusChapters } =
      params;

    try {
      const docSummaryConfig = await this.getDocSummaryConfig();
      if (!docSummaryConfig) {
        return {
          success: false,
          error:
            "未配置文档摘要 LLM，请在设置中配置 'Vibe Learning 文档摘要' 的模型",
        };
      }

      const resource = await this.findResourceByName(
        mainDbName,
        projectId,
        resourceName,
      );

      if (!resource) {
        return {
          success: false,
          error: `未找到名为 "${resourceName}" 的资源`,
        };
      }

      const db = databaseModule.getDatabase(mainDbName);
      const fullResource = db
        ? VibeLearningResourceTable.getResourceById(db, resource.id)
        : null;

      if (!fullResource?.isChunked || !fullResource.markdownPath) {
        return {
          success: false,
          error: `资源 "${resource.name}" 不是分章文档，请直接使用 read_resource_content`,
        };
      }

      const client = new OpenAI({
        apiKey: docSummaryConfig.llmApiKey,
        baseURL: docSummaryConfig.llmBaseUrl,
      });

      // 1. 读取摘要
      const summaryPath = this.getAbsoluteMarkdownPath(
        fullResource.markdownPath,
      );
      const summaryContent = await fs.readFile(summaryPath, "utf-8");
      const chapterOutlines = this.parseSummaryIndexContent(summaryContent);

      // 2. 确定要分析的章节
      let chaptersToAnalyze: number[];
      if (focusChapters && focusChapters.length > 0) {
        chaptersToAnalyze = focusChapters.filter(
          (i) => i >= 0 && i < fullResource.chapterCount,
        );
      } else {
        const searchHints = await this.searchContent({
          projectId,
          mainDbName,
          query: question,
          limit: 8,
        });
        const hintedChapterIndexes = searchHints
          .filter(
            (item) =>
              item.resourceId === resource.id &&
              item.hitType === "chapter" &&
              typeof item.chapterIndex === "number",
          )
          .map((item) => item.chapterIndex as number);

        // 让 LLM 根据问题、摘要和检索命中选择相关章节
        const selectionResponse = await client.chat.completions.create({
          model: docSummaryConfig.llmModel,
          messages: [
            {
              role: "system",
              content:
                "你是一个文档分析助手。根据用户问题、文档结构索引和检索命中，选择最相关的章节索引。优先保留与问题直接相关、能够提供正文证据的章节。只返回 JSON 数组格式的章节索引，如 [0, 2, 5]。最多选择 5 个最相关的章节。",
            },
            {
              role: "user",
              content: `问题：${question}\n\n文档结构索引：\n${summaryContent}\n\n检索命中章节线索：\n${JSON.stringify(
                searchHints.map((item) => ({
                  hitType: item.hitType,
                  chapterIndex: item.chapterIndex,
                  chapterTitle: item.chapterTitle,
                  chapterSummary: item.chapterSummary,
                })),
                null,
                2,
              )}\n\n请返回最相关的章节索引（0-based）：`,
            },
          ],
          temperature: 0.1,
          max_tokens: 100,
        });

        const selectionText =
          selectionResponse.choices[0]?.message?.content || "[]";
        try {
          const parsed = JSON.parse(
            selectionText.replace(/```json?\n?/g, "").replace(/```/g, ""),
          );
          const llmChapters = Array.isArray(parsed)
            ? parsed.filter(
                (i: number) => i >= 0 && i < fullResource.chapterCount,
              )
            : [];
          chaptersToAnalyze = Array.from(
            new Set([...hintedChapterIndexes, ...llmChapters]),
          ).slice(0, 5);
        } catch {
          chaptersToAnalyze = Array.from(new Set(hintedChapterIndexes)).slice(
            0,
            5,
          );
        }

        if (chaptersToAnalyze.length === 0) {
          chaptersToAnalyze = Array.from(
            { length: Math.min(5, fullResource.chapterCount) },
            (_, i) => i,
          );
        }
      }

      if (chaptersToAnalyze.length === 0) {
        return {
          success: false,
          error: "未找到与问题相关的章节",
        };
      }

      // 3. 逐章节提取相关信息
      const chaptersDir = this.getChaptersDirFromMarkdownPath(
        fullResource.markdownPath,
      );
      const absoluteChaptersDir = this.getAbsoluteMarkdownPath(chaptersDir);
      const sortedFiles = await listChapterFilesSorted(absoluteChaptersDir);
      const chapterExtracts: string[] = [];

      for (const chapterIdx of chaptersToAnalyze) {
        const chapterFileName = sortedFiles[chapterIdx];
        if (!chapterFileName) continue;
        const chapterFile = join(absoluteChaptersDir, chapterFileName);
        const outline = chapterOutlines.find(
          (item) => item.index === chapterIdx,
        );

        try {
          const chapterContent = await fs.readFile(chapterFile, "utf-8");
          const relevantContent = this.selectRelevantChapterSegments(
            question,
            chapterContent,
          );

          const extractResponse = await client.chat.completions.create({
            model: docSummaryConfig.llmModel,
            messages: [
              {
                role: "system",
                content:
                  "你是一个文档分析助手。从给定的章节正文片段中提取与用户问题相关的所有信息。优先提取关键论点、数据、引用、前提条件、步骤和限制。如果信息来自局部片段而非整章全文，请在提取中标注“基于片段”。如果章节与问题无关，简短说明即可。",
              },
              {
                role: "user",
                content: `问题：${question}\n\n章节信息：\n- 索引：${chapterIdx}\n- 标题：${outline?.title || `第 ${chapterIdx + 1} 章`}\n- 摘要：${outline?.summary || "无"}\n\n章节正文片段：\n${relevantContent}`,
              },
            ],
            temperature: 0.3,
            max_tokens: 2000,
          });

          const extract = extractResponse.choices[0]?.message?.content || "";
          chapterExtracts.push(
            `### 章节 ${chapterIdx}（${outline?.title || `第 ${chapterIdx + 1} 章`}）的相关信息：\n${extract}`,
          );
        } catch (error) {
          log.warn(
            `[VibeLearningIndexQueue] Failed to analyze chapter ${chapterIdx}: ${error}`,
          );
          chapterExtracts.push(`### 章节 ${chapterIdx}：分析失败`);
        }
      }

      // 4. 综合回答
      const synthesisResponse = await client.chat.completions.create({
        model: docSummaryConfig.llmModel,
        messages: [
          {
            role: "system",
            content:
              "你是一个专业的学习助手。根据从多个章节提取的信息，综合回答用户的问题。回答应全面、有条理，引用具体章节内容。使用中文回答。",
          },
          {
            role: "user",
            content: `问题：${question}\n\n文档摘要：\n${summaryContent}\n\n各章节提取的信息：\n${chapterExtracts.join("\n\n")}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      });

      const answer =
        synthesisResponse.choices[0]?.message?.content || "无法生成回答";

      return {
        success: true,
        answer,
        analyzedChapters: chaptersToAnalyze,
      };
    } catch (error) {
      log.error(`[VibeLearningIndexQueue] Error in deep read: ${error}`);
      return {
        success: false,
        error: `深度阅读失败: ${(error as Error).message}`,
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
      `[VibeLearningIndexQueue] Searching content: projectId=${projectId}, query="${query}", limit=${limit}`,
    );

    try {
      const embeddingConfig = await this.getEmbeddingConfig();
      const searchModelConfig = await readSearchModelProviderConfig();
      log.info("[SearchCore][vibe-learning][config]", {
        query,
        limit,
        projectId,
        mainDbName,
        vectorEnabled: Boolean(embeddingConfig),
        vectorModel: embeddingConfig?.model,
        searchModelDir: searchModelConfig.localModelDir,
        enableExpander: searchModelConfig.enableExpander,
        enableReranker: searchModelConfig.enableReranker,
        queryExpanderModel: searchModelConfig.queryExpanderModel,
        rerankerModel: searchModelConfig.rerankerModel,
        devicePolicy: searchModelConfig.devicePolicy,
        batchSize: searchModelConfig.batchSize,
      });

      const expander =
        searchModelConfig.enableExpander && searchModelConfig.queryExpanderModel
          ? new LocalQueryExpander({
              modelDir: searchModelConfig.localModelDir,
              modelName: searchModelConfig.queryExpanderModel,
              devicePolicy: searchModelConfig.devicePolicy,
              maxAlternatives: 2,
            })
          : new NoopExpander(
              searchModelConfig.enableExpander
                ? "未配置本地 query expansion 模型"
                : "query expansion 已禁用",
            );
      const reranker =
        searchModelConfig.enableReranker && searchModelConfig.rerankerModel
          ? new LocalReranker({
              modelDir: searchModelConfig.localModelDir,
              modelName: searchModelConfig.rerankerModel,
              batchSize: searchModelConfig.batchSize,
              devicePolicy: searchModelConfig.devicePolicy,
            })
          : new NoopReranker(
              searchModelConfig.enableReranker
                ? "未配置本地 reranker 模型"
                : "reranker 已禁用",
            );

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
                    const queryEmbedding = (
                      await this.embedTexts([queryText], embeddingConfig)
                    )[0];
                    return queryEmbedding || null;
                  } catch (error) {
                    log.error(
                      `[VibeLearningIndexQueue] Vec query embedding failed: ${error}`,
                    );
                    return null;
                  }
                },
              }
            : null,
        },
        adapter,
        expander,
        reranker,
        logger: (pipelineState) => {
          log.info("[SearchCore][vibe-learning]", pipelineState);
        },
        stageLogger: (stageLog) => {
          log.info(`[SearchCore][vibe-learning][${stageLog.stage}]`, stageLog);
        },
      });

      log.info(
        `[VibeLearningIndexQueue] Hybrid search completed: found ${results.length} results (FTS: ${pipelineLog.ftsCount}, Vec: ${pipelineLog.vecCount})`,
      );

      const db = databaseModule.getDatabase(mainDbName);
      const resourceCache = new Map<
        number,
        ReturnType<typeof VibeLearningResourceTable.getResourceById> | null
      >();
      const outlineCache = new Map<number, ChapterOutline[]>();

      const enrichedResults = await Promise.all(
        results.map(async (result) => {
          const chunkMetadata =
            typeof result.chunkIndex === "number"
              ? vibeLearningDBManager.getChunkMetadata(
                  mainDbName,
                  projectId,
                  result.resourceId,
                  result.chunkIndex,
                )
              : null;

          if (!db || typeof result.chunkIndex !== "number") {
            return result;
          }

          let fullResource = resourceCache.get(result.resourceId);
          if (fullResource === undefined) {
            fullResource = VibeLearningResourceTable.getResourceById(
              db,
              result.resourceId,
            );
            resourceCache.set(result.resourceId, fullResource);
          }

          if (!fullResource?.isChunked || !fullResource.markdownPath) {
            return result;
          }

          let outlines = outlineCache.get(result.resourceId);
          if (!outlines) {
            outlines = await this.getChapterOutlines(fullResource.markdownPath);
            outlineCache.set(result.resourceId, outlines);
          }

          const chunkLocation = this.decodeChunkLocation(result.chunkIndex);
          const matchedChapter =
            chunkLocation.chapterIndex != null
              ? outlines.find(
                  (item) => item.index === chunkLocation.chapterIndex,
                )
              : undefined;

          return {
            ...result,
            displayContent: chunkMetadata?.displayContent || result.content,
            searchContent: chunkMetadata?.searchContent || result.content,
            sectionTitle: chunkMetadata?.sectionTitle,
            sectionPath: chunkMetadata?.sectionPath,
            chunkStartLine: chunkMetadata?.chunkStartLine,
            chunkEndLine: chunkMetadata?.chunkEndLine,
            chunkLevel:
              chunkLocation.hitType === "summary"
                ? "summary"
                : chunkMetadata?.sectionTitle
                  ? "section"
                  : "chapter",
            evidenceScore: result.score,
            whyMatched:
              chunkLocation.hitType === "summary"
                ? "命中摘要索引，适合作为定位线索。"
                : chunkMetadata?.sectionTitle
                  ? `命中章节正文中的小节「${chunkMetadata.sectionTitle}」，建议围绕该小节继续补读。`
                  : "命中章节正文，建议继续补读上下文确认细节。",
            hitType: chunkLocation.hitType,
            chapterIndex: chunkLocation.chapterIndex,
            chapterTitle: matchedChapter?.title,
            chapterSummary: matchedChapter?.summary,
            chunkIndexInSection: chunkLocation.chunkIndexInSection,
          };
        }),
      );

      return enrichedResults.map(
        (result): VLSearchResult => ({
          ...result,
          displayContent: String(result.displayContent || result.content),
          searchContent: String(result.searchContent || result.content),
          chunkLevel:
            (result.chunkLevel as VLSearchResult["chunkLevel"]) ||
            (result.hitType === "summary" ? "summary" : "passage"),
          evidenceScore:
            typeof result.evidenceScore === "number"
              ? result.evidenceScore
              : result.score,
          whyMatched: String(
            result.whyMatched ||
              (result.hitType === "summary"
                ? "命中摘要索引，适合作为定位线索。"
                : "命中正文内容，可继续补读上下文。"),
          ),
        }),
      );
    } catch (error) {
      log.error(`[VibeLearningIndexQueue] Search failed: ${error}`);
      return [];
    }
  }

  async checkAndRecoverResources(
    mainDbName: string,
    options: RecoverResourcesOptions = {},
  ): Promise<void> {
    log.info(
      `[VibeLearningIndexQueue] Checking resources for database: ${mainDbName}`,
    );

    try {
      const db = databaseModule.getDatabase(mainDbName);

      if (!db) {
        log.warn("[VibeLearningIndexQueue] No database connection");
        return;
      }

      // 检查是否有 vibe_learning_resources 表
      const tableExists = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='vibe_learning_resources'",
        )
        .get();

      if (!tableExists) {
        log.info(
          "[VibeLearningIndexQueue] vibe_learning_resources table not found, skipping",
        );
        return;
      }

      // 获取所有资源
      const allResources = VibeLearningResourceTable.getAllResources(db);

      log.info(
        `[VibeLearningIndexQueue] Found ${allResources.length} resources to check`,
      );

      const forceEmbedding = options.forceEmbedding === true;
      let processed = 0;

      for (const resource of allResources) {
        // 检查状态
        const status = await this.computeResourceStatus(resource, mainDbName, {
          forceEmbedding,
        });

        if (
          status === "pending" ||
          status === "need_convert" ||
          status === "need_download"
        ) {
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
              `[VibeLearningIndexQueue] Added full task for resource ${resource.id} (status: ${status}, sourceType: ${resource.sourceType || "local"})`,
            );
          } else {
            log.info(
              `[VibeLearningIndexQueue] Skip full task for resource ${resource.id}, reason=${result.reason}, currentStatus=${result.currentStatus}`,
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
            log.info(
              `[VibeLearningIndexQueue] Added index_only task for resource ${resource.id}`,
            );
          } else {
            log.info(
              `[VibeLearningIndexQueue] Skip index_only task for resource ${resource.id}, reason=${result.reason}, currentStatus=${result.currentStatus}`,
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
              `[VibeLearningIndexQueue] Added embedding_only task for resource ${resource.id}`,
            );
          } else {
            log.info(
              `[VibeLearningIndexQueue] Skip embedding_only task for resource ${resource.id}, reason=${result.reason}, currentStatus=${result.currentStatus}`,
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
    options: RecoverResourcesOptions = {},
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
        const cacheStatus = await getBilibiliCacheStatus(
          meta.bvid,
          meta.cid,
          meta.quality,
        );

        // 如果没有本地缓存且没有 markdown，需要完整处理（下载+转录+索引）
        if (!cacheStatus?.localPath && !resource.markdownPath) {
          return "need_download";
        }
      } catch (e) {
        log.warn(
          `[VibeLearningIndexQueue] Failed to parse bilibili meta for resource ${resource.id}: ${e}`,
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
          `[VibeLearningIndexQueue] Failed to parse youtube meta for resource ${resource.id}: ${e}`,
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
      resource.id,
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
        resource.id,
      );
      if (!vecIndexExists) {
        return "need_embedding";
      }
    }

    return "completed";
  }

  async reinitAllVecTables(
    dimensions: number,
    mainDbName?: string,
  ): Promise<boolean> {
    log.info(
      `[VibeLearningIndexQueue] Reinit all vec tables with dimensions: ${dimensions}`,
    );

    try {
      // 清除 embedding 配置缓存，下次会重新读取
      this.clearEmbeddingConfigCache();

      // 更新 VibeLearningDBManager 的维度配置
      vibeLearningDBManager.setVecDimensions(dimensions);

      const targetDbName =
        mainDbName || databaseModule.getCurrentDatabaseName();
      const db = databaseModule.getDatabase(targetDbName);

      if (!db) {
        log.warn("[VibeLearningIndexQueue] No database connection");
        return false;
      }

      // 检查是否有 vibe_learning_projects 表
      const tableExists = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='vibe_learning_projects'",
        )
        .get();

      if (!tableExists) {
        log.info(
          "[VibeLearningIndexQueue] vibe_learning_projects table not found, skipping",
        );
        return true;
      }

      // 获取所有项目 ID
      const projects = db
        .prepare("SELECT id FROM vibe_learning_projects")
        .all() as Array<{ id: number }>;

      // 为每个项目重建向量表
      let processed = 0;
      for (const project of projects) {
        vibeLearningDBManager.reinitVecTable(
          targetDbName,
          project.id,
          dimensions,
        );
        processed += 1;
        await yieldEvery(processed, VibeLearningIndexQueue.RECOVER_YIELD_EVERY);
      }
      await yieldToEventLoop();

      log.info(
        `[VibeLearningIndexQueue] Reinit vec tables for ${projects.length} projects`,
      );
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
        log.warn(
          "[VibeLearningIndexQueue] No embedding config, skipping reembedding",
        );
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
          "SELECT name FROM sqlite_master WHERE type='table' AND name='vibe_learning_resources'",
        )
        .get();

      if (!tableExists) {
        log.info(
          "[VibeLearningIndexQueue] vibe_learning_resources table not found, skipping",
        );
        return true;
      }

      // 获取所有资源
      const allResources = VibeLearningResourceTable.getAllResources(db);

      log.info(
        `[VibeLearningIndexQueue] Adding embedding tasks for ${allResources.length} resources`,
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
              `[VibeLearningIndexQueue] Skip reembedding task for resource ${resource.id}, reason=${result.reason}, currentStatus=${result.currentStatus}`,
            );
          }
        }
      }

      return true;
    } catch (error) {
      log.error(
        `[VibeLearningIndexQueue] Error reembedding resources: ${error}`,
      );
      return false;
    }
  }
}

const vibeLearningIndexQueue = new VibeLearningIndexQueue();
export default vibeLearningIndexQueue;
