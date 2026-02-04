import { EventEmitter } from "events";
import { ipcMain, BrowserWindow } from "electron";
import { promises as fs } from "fs";
import { join, dirname, extname } from "node:path";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import log from "electron-log";
import fetch from "node-fetch";
import OpenAI from "openai";
import { Module } from "../types/module";
import PathUtil from "../utils/PathUtil";
import vibeLearningDBManager from "./vibe-learning-db";
import markitdownModule from "./markitdown";
import databaseModule from "./database";
import transcriptionModule from "./transcription";
import VibeLearningResourceTable from "./tables/vibe-learning-resource";
import { cacheBilibiliVideo, getBilibiliCacheStatus } from "./bilibili-cache";
import { chunk } from "llm-chunk";
import { Jieba } from "@node-rs/jieba";
import { dict } from "@node-rs/jieba/dict";
import crypto from "node:crypto";
import type { LLMUsageConfig, ProviderConfig } from "@/types/llm";
import type { BilibiliSourceMeta, NoteSourceMeta } from "@/types/vibe-learning";
import ContentTable from "./tables/content";
import { getMarkdown } from "@/utils/markdown.ts";

/**
 * Embedding 配置接口
 */
interface EmbeddingConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  dimensions: number;
  distance: number;
}

/**
 * 转译配置接口
 */
interface TranscriptionConfig {
  model: string;
  modelDir: string;
  // LLM 优化配置（始终启用）
  llmProvider?: string;
  llmApiKey?: string;
  llmModel?: string;
  llmBaseUrl?: string;
}

/**
 * Setting 类型定义（仅包含转译相关字段）
 */
interface SettingForTranscription {
  transcription?: {
    currentModel?: string;
  };
  llmUsageSettings?: {
    transcriptionOptimization?: LLMUsageConfig | null;
  };
  llmConfigs?: ProviderConfig[];
}

const jieba = Jieba.withDict(dict);

type TaskType = "full" | "convert_only" | "index_only" | "embedding_only";
type TaskStatus =
  | "pending"
  | "downloading" // 正在下载远程视频
  | "transcribing" // 正在转录音视频
  | "converting"
  | "indexing"
  | "embedding"
  | "completed"
  | "failed";

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
  error?: string;
}

class VibeLearningIndexQueue extends EventEmitter implements Module {
  name: string;
  private queue: IndexTask[] = [];
  private activeTaskCount = 0;
  private maxConcurrency = 2;
  private isProcessing = false;

  // 内存中记录当前正在处理的任务状态
  private processingStatus: Map<number, TaskStatus> = new Map();

  // 缓存 embedding 配置
  private cachedEmbeddingConfig: EmbeddingConfig | null | undefined = undefined;

  // 缓存转译配置
  private cachedTranscriptionConfig: TranscriptionConfig | null | undefined =
    undefined;

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
      const setting = JSON.parse(settingContent);

      const { embeddingProvider } = setting;
      if (!embeddingProvider || !embeddingProvider.currentConfigId) {
        this.cachedEmbeddingConfig = null;
        return null;
      }

      const { configs, currentConfigId } = embeddingProvider;
      const currentConfig = configs?.find(
        (c: { id: string }) => c.id === currentConfigId,
      );

      if (!currentConfig) {
        this.cachedEmbeddingConfig = null;
        return null;
      }

      const { apiKey, baseUrl, currentModel, models } = currentConfig;
      const modelConfig = models?.find(
        (m: { name: string }) => m.name === currentModel,
      );

      if (!apiKey || !baseUrl || !currentModel || !modelConfig) {
        this.cachedEmbeddingConfig = null;
        return null;
      }

      this.cachedEmbeddingConfig = {
        baseUrl,
        apiKey,
        model: currentModel,
        dimensions: modelConfig.contextLength, // contextLength 实际是维度
        distance: modelConfig.distance || 0.6,
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

  async init() {
    // 注册 IPC 处理器
    ipcMain.handle("vl-add-index-task", async (_event, params) => {
      this.addTask(params);
      return true;
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
      "vl-check-markdown-exists",
      async (_event, relativePath: string) => {
        return this.checkMarkdownExists(relativePath);
      },
    );

    ipcMain.handle("vl-search-content", async (_event, params) => {
      return this.searchContent(params);
    });

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

    // 注册数据库切换回调
    const databaseModule = (await import("./database")).default;
    const currentDbName = databaseModule.getCurrentDatabaseName();

    // 应用启动时检查资源
    setImmediate(() => {
      this.checkAndRecoverResources(currentDbName);
    });

    // 数据库切换时的处理
    databaseModule.onDatabaseChange(async (newDbName: string) => {
      log.info(`[VibeLearningIndexQueue] Database changed to: ${newDbName}`);

      // 关闭旧数据库的项目索引连接
      // 注意：这里不能直接获取旧数据库名，因为回调时已经更新了
      // 暂时跳过关闭逻辑，由 VibeLearningDBManager 自行管理

      // 检查新数据库的待处理资源
      await this.checkAndRecoverResources(newDbName);
    });

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
   * 添加任务到队列
   */
  addTask(task: Omit<IndexTask, "status" | "retryCount">): void {
    // 检查是否已存在相同资源的任务
    const existingIndex = this.queue.findIndex(
      (t) => t.resourceId === task.resourceId,
    );

    const newTask: IndexTask = {
      ...task,
      status: "pending",
      retryCount: 0,
    };

    if (existingIndex >= 0) {
      // 替换现有任务
      this.queue[existingIndex] = newTask;
    } else {
      this.queue.push(newTask);
    }

    log.info(
      `[VibeLearningIndexQueue] Added task for resource ${task.resourceId}, type: ${task.type}`,
    );

    // 开始处理队列
    this.processQueue();
  }

  /**
   * 获取资源的处理状态
   */
  getResourceStatus(resourceId: number): TaskStatus | null {
    return this.processingStatus.get(resourceId) || null;
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
          // 检查是否是 Bilibili 视频
          markdownContent = await this.processBilibiliVideo(
            resourceId,
            sourceMetaInfo,
            resourceName,
          );
        } else {
          // 普通资源处理流程
          this.processingStatus.set(resourceId, "converting");
          this.emit("status-change", resourceId, "converting");

          log.info(
            `[VibeLearningIndexQueue] Converting resource ${resourceId}`,
          );

          // 如果是远程 URL，先下载到本地
          let localFilePath = originalPath;
          let needCleanup = false;

          if (this.isRemoteUrl(originalPath)) {
            log.info(
              `[VibeLearningIndexQueue] Downloading remote file: ${originalPath}`,
            );
            localFilePath = await this.downloadRemoteFile(originalPath);
            needCleanup = true;
            log.info(
              `[VibeLearningIndexQueue] Downloaded to: ${localFilePath}`,
            );
          }

          try {
            // 获取转译配置
            const transcriptionConfig = await this.getTranscriptionConfig();

            // 调用 MarkItDown 转换
            const result = await markitdownModule.convertFile({
              filePath: localFilePath,
              fileName: originalPath.split("/").pop() || "file",
              // 从配置读取转录模型
              transcriptionModel: transcriptionConfig?.model || "base",
              transcriptionModelDir: transcriptionConfig?.modelDir,
              // 始终使用句子级别转录
              transcriptionWordTimestamps: false,
              // LLM 优化参数（始终启用）
              transcriptionLLMProvider: transcriptionConfig?.llmProvider,
              transcriptionLLMApiKey: transcriptionConfig?.llmApiKey,
              transcriptionLLMModel: transcriptionConfig?.llmModel,
              transcriptionLLMBaseUrl: transcriptionConfig?.llmBaseUrl,
            });

            if (!result.success || !result.textContent) {
              throw new Error(result.error || "Conversion failed");
            }

            markdownContent = result.textContent;
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

        // 保存 Markdown 文件
        markdownPath = await this.saveMarkdown(
          mainDbName,
          projectId,
          resourceId,
          resourceName,
          markdownContent,
        );

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
        this.processingStatus.set(resourceId, "indexing");
        this.emit("status-change", resourceId, "indexing");

        log.info(`[VibeLearningIndexQueue] Indexing resource ${resourceId}`);

        // 如果没有 markdown 内容，从文件读取
        if (!markdownContent && markdownPath) {
          const absolutePath = this.getAbsoluteMarkdownPath(markdownPath);
          markdownContent = await fs.readFile(absolutePath, "utf-8");
        }

        if (!markdownContent) {
          throw new Error("No markdown content to index");
        }

        // 创建索引
        await this.createIndex(
          mainDbName,
          projectId,
          resourceId,
          markdownContent,
        );

        log.info(`[VibeLearningIndexQueue] Indexed resource ${resourceId}`);
      }

      // 仅 embedding 阶段（已有 FTS 索引但缺少向量索引）
      if (type === "embedding_only") {
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
        );

        log.info(
          `[VibeLearningIndexQueue] Generated embedding for resource ${resourceId}`,
        );
      }

      // 完成
      this.processingStatus.delete(resourceId);
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);

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
   * 处理 Bilibili 视频：下载、转录、生成 Markdown
   */
  private async processBilibiliVideo(
    resourceId: number,
    sourceMetaInfo: string,
    resourceName: string,
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

    // 1. 检查是否已有本地缓存
    let localVideoPath: string | null = null;
    const cacheStatus = await getBilibiliCacheStatus(bvid, cid, quality);

    if (cacheStatus?.localPath) {
      log.info(
        `[VibeLearningIndexQueue] Using cached video: ${cacheStatus.localPath}`,
      );
      localVideoPath = cacheStatus.localPath;
    } else {
      // 2. 下载视频
      this.processingStatus.set(resourceId, "downloading");
      this.emit("status-change", resourceId, "downloading");

      log.info(`[VibeLearningIndexQueue] Downloading Bilibili video...`);

      // 获取 Bilibili API 凭证和视频流 URL
      const settingPath = join(PathUtil.getAppDir(), "setting.json");
      const settingContent = await fs.readFile(settingPath, "utf-8");
      const setting = JSON.parse(settingContent);
      const credentials = setting.integration?.bilibili?.credentials || {};

      // 获取视频播放地址
      const playUrl = await this.getBilibiliPlayUrl(
        bvid,
        cid,
        quality,
        credentials,
      );
      if (!playUrl) {
        throw new Error("无法获取视频播放地址");
      }

      // 下载并缓存视频
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

    // 3. 转录视频
    this.processingStatus.set(resourceId, "transcribing");
    this.emit("status-change", resourceId, "transcribing");

    log.info(`[VibeLearningIndexQueue] Transcribing video...`);

    // 从视频提取音频
    const audioResult =
      await transcriptionModule.extractAudioFromVideo(localVideoPath);
    if (!audioResult.success || !audioResult.audioPath) {
      throw new Error(audioResult.error || "提取音频失败");
    }

    // 获取转录配置
    const transcriptionConfig = await this.getTranscriptionConfig();

    // 转录音频
    type ModelSize =
      | "tiny"
      | "base"
      | "small"
      | "medium"
      | "large-v1"
      | "large-v2"
      | "large-v3";
    const modelSize: ModelSize =
      (transcriptionConfig?.model as ModelSize) || "base";
    const transcriptionResult = await transcriptionModule.transcribeAudio(
      audioResult.audioPath,
      {
        modelSize,
        language: "zh",
        sentenceLevel: true,
        useLLMOptimization: !!transcriptionConfig?.llmProvider,
      },
    );

    // 清理临时音频文件
    try {
      await fs.unlink(audioResult.audioPath);
    } catch (e) {
      log.warn(`[VibeLearningIndexQueue] Failed to cleanup audio file: ${e}`);
    }

    if (!transcriptionResult.success || !transcriptionResult.data) {
      throw new Error(transcriptionResult.error || "转录失败");
    }

    // 4. 生成 Markdown 内容
    this.processingStatus.set(resourceId, "converting");
    this.emit("status-change", resourceId, "converting");

    const { text, segments } = transcriptionResult.data;
    const markdownContent = this.generateVideoTranscriptMarkdown(
      title || resourceName,
      bvid,
      text,
      segments,
    );

    log.info(
      `[VibeLearningIndexQueue] Bilibili video processed successfully: ${resourceId}`,
    );

    return markdownContent;
  }

  /**
   * 获取 Bilibili 视频播放地址
   */
  private async getBilibiliPlayUrl(
    bvid: string,
    cid: string,
    quality: number,
    credentials: { SESSDATA?: string; bili_jct?: string; DedeUserID?: string },
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
   * 生成视频转录 Markdown 内容
   */
  private generateVideoTranscriptMarkdown(
    title: string,
    bvid: string,
    transcript: string,
    segments?: Array<{ text: string; start: number; end: number }>,
  ): string {
    const lines: string[] = [];

    // 标题
    lines.push(`# ${title}`);
    lines.push("");
    lines.push(`> Bilibili 视频: https://www.bilibili.com/video/${bvid}`);
    lines.push("");
    lines.push("## 视频转录");
    lines.push("");

    // 如果有时间戳段落，按段落输出
    if (segments && segments.length > 0) {
      for (const segment of segments) {
        const time = this.formatTimestamp(segment.start);
        lines.push(`**[${time}]** ${segment.text}`);
        lines.push("");
      }
    } else {
      // 直接输出全文
      lines.push(transcript);
    }

    return lines.join("\n");
  }

  /**
   * 格式化时间戳（毫秒 -> MM:SS）
   */
  private formatTimestamp(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  /**
   * 保存 Markdown 文件
   */
  private async saveMarkdown(
    mainDbName: string,
    projectId: number,
    resourceId: number,
    resourceName: string,
    content: string,
  ): Promise<string> {
    const dbNameWithoutExt = mainDbName.replace(/\.db$/, "");
    // 使用原始文件名（去掉扩展名）+ resourceId 作为文件名
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

  /**
   * 获取文件名（不含扩展名）
   */
  private getBaseFileName(fileName: string): string {
    const lastDotIndex = fileName.lastIndexOf(".");
    if (lastDotIndex === -1 || lastDotIndex === 0) {
      return fileName;
    }
    return fileName.substring(0, lastDotIndex);
  }

  /**
   * 清理文件名中的非法字符
   */
  private sanitizeFileName(fileName: string): string {
    // 替换文件系统中不允许的字符
    return fileName.replace(/[<>:"/\\|?*]/g, "_").trim();
  }

  /**
   * 获取 Markdown 文件的绝对路径
   */
  private getAbsoluteMarkdownPath(relativePath: string): string {
    const appDir = PathUtil.getAppDir();
    return join(appDir, relativePath);
  }

  /**
   * 更新数据库中的 markdown_path
   */
  private async updateResourceMarkdownPath(
    mainDbName: string,
    resourceId: number,
    markdownPath: string,
  ): Promise<void> {
    const databaseModule = (await import("./database")).default;
    const db = databaseModule.getDatabase(mainDbName);

    if (!db) {
      throw new Error("Database not found");
    }

    const VibeLearningResourceTable = (
      await import("./tables/vibe-learning-resource")
    ).default;
    VibeLearningResourceTable.updateMarkdownPath(db, resourceId, markdownPath);
  }

  /**
   * 创建索引
   */
  private async createIndex(
    mainDbName: string,
    projectId: number,
    resourceId: number,
    content: string,
  ): Promise<void> {
    // 分块
    const chunks = chunk(content, {
      minLength: 500,
      maxLength: 2000,
      overlap: 0,
      splitter: "paragraph",
    });

    // 获取 embedding 配置
    const embeddingConfig = await this.getEmbeddingConfig();

    // 对每个块进行分词处理（用于 FTS）和向量生成
    const processedChunks: Array<{
      text: string;
      original: string;
      embedding: number[] | undefined;
    }> = [];

    // 如果有 embedding 配置，批量生成向量
    if (embeddingConfig) {
      const client = new OpenAI({
        apiKey: embeddingConfig.apiKey,
        baseURL: embeddingConfig.baseUrl,
      });

      log.info(
        `[VibeLearningIndexQueue] Generating embeddings for ${chunks.length} chunks`,
      );

      // 批量处理以提高效率，每批最多 10 个
      const batchSize = 10;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batchChunks = chunks.slice(i, i + batchSize);

        try {
          // OpenAI API 支持批量 embedding
          const res = await client.embeddings.create({
            model: embeddingConfig.model,
            input: batchChunks,
            dimensions: embeddingConfig.dimensions,
          });

          for (let j = 0; j < batchChunks.length; j++) {
            const chunkText = batchChunks[j];
            const segmented = jieba.cutForSearch(chunkText, true).join(" ");
            processedChunks.push({
              text: segmented,
              original: chunkText,
              embedding: res.data[j]?.embedding,
            });
          }
        } catch (error) {
          log.error(
            `[VibeLearningIndexQueue] Error generating embeddings for batch ${i}: ${error}`,
          );
          // 失败时不添加 embedding，仍然创建 FTS 索引
          for (const chunkText of batchChunks) {
            const segmented = jieba.cutForSearch(chunkText, true).join(" ");
            processedChunks.push({
              text: segmented,
              original: chunkText,
              embedding: undefined,
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
        processedChunks.push({
          text: segmented,
          original: chunkText,
          embedding: undefined,
        });
      }
    }

    // 创建索引
    vibeLearningDBManager.createIndex(
      mainDbName,
      projectId,
      resourceId,
      content,
      processedChunks,
    );
  }

  /**
   * 仅为资源生成 embedding（不重建 FTS 索引）
   */
  private async createEmbeddingOnly(
    mainDbName: string,
    projectId: number,
    resourceId: number,
    content: string,
  ): Promise<void> {
    const embeddingConfig = await this.getEmbeddingConfig();
    if (!embeddingConfig) {
      log.warn(
        `[VibeLearningIndexQueue] No embedding config, skipping embedding for resource ${resourceId}`,
      );
      return;
    }

    // 分块
    const chunks = chunk(content, {
      minLength: 500,
      maxLength: 2000,
      overlap: 0,
      splitter: "paragraph",
    });

    const client = new OpenAI({
      apiKey: embeddingConfig.apiKey,
      baseURL: embeddingConfig.baseUrl,
    });

    log.info(
      `[VibeLearningIndexQueue] Generating embeddings only for ${chunks.length} chunks`,
    );

    const processedChunks: Array<{ text: string; embedding: number[] }> = [];

    // 批量处理
    const batchSize = 10;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batchChunks = chunks.slice(i, i + batchSize);

      try {
        const res = await client.embeddings.create({
          model: embeddingConfig.model,
          input: batchChunks,
          dimensions: embeddingConfig.dimensions,
        });

        for (let j = 0; j < batchChunks.length; j++) {
          const chunkText = batchChunks[j];
          const embedding = res.data[j]?.embedding;
          if (embedding) {
            processedChunks.push({
              text: chunkText,
              embedding,
            });
          }
        }
      } catch (error) {
        log.error(
          `[VibeLearningIndexQueue] Error generating embeddings: ${error}`,
        );
        throw error;
      }
    }

    // 仅添加向量索引
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

  /**
   * 检查是否是远程 URL
   */
  private isRemoteUrl(path: string): boolean {
    return path.startsWith("http://") || path.startsWith("https://");
  }

  /**
   * 下载远程文件到临时目录
   */
  private async downloadRemoteFile(url: string): Promise<string> {
    // 生成唯一的临时文件名
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

  /**
   * 从 URL 中提取文件扩展名
   */
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

  /**
   * 检查 Markdown 文件是否存在
   */
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
    const databaseModule = (await import("./database")).default;
    const db = databaseModule.getDatabase(mainDbName);

    if (!db) {
      return null;
    }

    const VibeLearningResourceTable = (
      await import("./tables/vibe-learning-resource")
    ).default;
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

  /**
   * 读取 Markdown 完整内容
   */
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

      // 限制最大返回长度（100KB）
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
      };
    } catch (error) {
      log.error(`[VibeLearningIndexQueue] Error reading markdown: ${error}`);
      return {
        success: false,
        error: `读取失败: ${(error as Error).message}`,
      };
    }
  }

  /**
   * 按行范围读取 Markdown 内容
   */
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
   * 搜索内容（混合搜索：FTS + 向量搜索）
   */
  async searchContent(params: {
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
  > {
    const { projectId, mainDbName, query, limit = 5 } = params;

    log.info(
      `[VibeLearningIndexQueue] Searching content: projectId=${projectId}, query="${query}", limit=${limit}`,
    );

    try {
      // 1. FTS 搜索（对查询词进行分词处理）
      const segmentedQuery = jieba.cutForSearch(query, true).join(" ");
      const ftsResults = vibeLearningDBManager.searchFTS(
        mainDbName,
        projectId,
        segmentedQuery,
        limit * 2, // 获取更多结果用于融合
      );

      log.info(
        `[VibeLearningIndexQueue] FTS search returned ${ftsResults.length} results`,
      );

      // 2. 向量搜索
      let vecResults: Array<{
        resourceId: number;
        chunkIndex: number;
        content: string;
        distance: number;
      }> = [];

      const embeddingConfig = await this.getEmbeddingConfig();
      if (embeddingConfig) {
        try {
          const client = new OpenAI({
            apiKey: embeddingConfig.apiKey,
            baseURL: embeddingConfig.baseUrl,
          });

          // 生成查询向量
          const res = await client.embeddings.create({
            model: embeddingConfig.model,
            input: query,
            dimensions: embeddingConfig.dimensions,
          });

          const queryEmbedding = res.data[0]?.embedding;
          if (queryEmbedding) {
            vecResults = vibeLearningDBManager.searchVec(
              mainDbName,
              projectId,
              queryEmbedding,
              limit * 2, // 获取更多结果用于融合
              embeddingConfig.distance,
            );

            log.info(
              `[VibeLearningIndexQueue] Vec search returned ${vecResults.length} results`,
            );
          }
        } catch (error) {
          log.error(
            `[VibeLearningIndexQueue] Vec search failed, falling back to FTS only: ${error}`,
          );
        }
      }

      // 3. RRF 融合结果
      const mergedResults = this.mergeWithRRF(ftsResults, vecResults, limit);

      // 从主数据库获取资源信息
      const db = databaseModule.getDatabase(mainDbName);

      if (!db) {
        return [];
      }

      // 提取去重的 resourceId
      const resourceIds = [...new Set(mergedResults.map((r) => r.resourceId))];

      // 批量获取资源信息
      const resources = VibeLearningResourceTable.getResourcesByIds(
        db,
        resourceIds,
      );

      // 构建 id -> resource 映射
      const resourceMap = new Map(resources.map((r) => [r.id, r]));

      // 映射结果
      const results = mergedResults.map((r) => ({
        resourceId: r.resourceId,
        resourceName:
          resourceMap.get(r.resourceId)?.name || `资源 ${r.resourceId}`,
        content: r.content,
        score: r.score,
      }));

      log.info(
        `[VibeLearningIndexQueue] Hybrid search completed: found ${results.length} results (FTS: ${ftsResults.length}, Vec: ${vecResults.length})`,
      );

      return results;
    } catch (error) {
      log.error(`[VibeLearningIndexQueue] Search failed: ${error}`);
      return [];
    }
  }

  /**
   * 使用 RRF（Reciprocal Rank Fusion）算法融合 FTS 和向量搜索结果
   * RRF 分数 = 1 / (k + rank)，k 通常取 60
   */
  private mergeWithRRF(
    ftsResults: Array<{ resourceId: number; content: string }>,
    vecResults: Array<{
      resourceId: number;
      content: string;
      chunkIndex: number;
      distance: number;
    }>,
    limit: number,
  ): Array<{ resourceId: number; content: string; score: number }> {
    const k = 60;
    const scores = new Map<
      string,
      { score: number; content: string; resourceId: number }
    >();

    // 处理 FTS 结果
    ftsResults.forEach((r, idx) => {
      // 使用 resourceId + content 前50字符作为唯一标识
      const key = `${r.resourceId}-${r.content.slice(0, 50)}`;
      const existing = scores.get(key);
      const rrfScore = 1 / (k + idx + 1);

      if (existing) {
        existing.score += rrfScore;
      } else {
        scores.set(key, {
          score: rrfScore,
          content: r.content,
          resourceId: r.resourceId,
        });
      }
    });

    // 处理向量搜索结果
    vecResults.forEach((r, idx) => {
      const key = `${r.resourceId}-${r.content.slice(0, 50)}`;
      const existing = scores.get(key);
      const rrfScore = 1 / (k + idx + 1);

      if (existing) {
        existing.score += rrfScore;
      } else {
        scores.set(key, {
          score: rrfScore,
          content: r.content,
          resourceId: r.resourceId,
        });
      }
    });

    // 按分数排序并返回前 limit 个结果
    return [...scores.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * 应用启动时检查需要处理的资源
   */
  async checkAndRecoverResources(mainDbName: string): Promise<void> {
    log.info(
      `[VibeLearningIndexQueue] Checking resources for database: ${mainDbName}`,
    );

    try {
      // 动态导入数据库模块避免循环依赖
      const databaseModule = (await import("./database")).default;
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
      const VibeLearningResourceTable = (
        await import("./tables/vibe-learning-resource")
      ).default;
      const allResources = VibeLearningResourceTable.getAllResources(db);

      log.info(
        `[VibeLearningIndexQueue] Found ${allResources.length} resources to check`,
      );

      for (const resource of allResources) {
        // 检查状态
        const status = await this.computeResourceStatus(resource, mainDbName);

        if (
          status === "pending" ||
          status === "need_convert" ||
          status === "need_download"
        ) {
          // 需要完整处理（对于 bilibili 视频，full 任务会自动处理下载）
          this.addTask({
            resourceId: resource.id,
            projectId: resource.projectId,
            mainDbName,
            originalPath: resource.originalPath,
            resourceName: resource.name,
            type: "full",
          });
          log.info(
            `[VibeLearningIndexQueue] Added full task for resource ${resource.id} (status: ${status}, sourceType: ${resource.sourceType || "local"})`,
          );
        } else if (status === "need_index") {
          // 只需要索引
          this.addTask({
            resourceId: resource.id,
            projectId: resource.projectId,
            mainDbName,
            originalPath: resource.originalPath,
            resourceName: resource.name,
            markdownPath: resource.markdownPath || undefined,
            type: "index_only",
          });
          log.info(
            `[VibeLearningIndexQueue] Added index_only task for resource ${resource.id}`,
          );
        } else if (status === "need_embedding") {
          // 只需要生成 embedding
          this.addTask({
            resourceId: resource.id,
            projectId: resource.projectId,
            mainDbName,
            originalPath: resource.originalPath,
            resourceName: resource.name,
            markdownPath: resource.markdownPath || undefined,
            type: "embedding_only",
          });
          log.info(
            `[VibeLearningIndexQueue] Added embedding_only task for resource ${resource.id}`,
          );
        }
      }
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
      sourceType?: string | null;
      sourceMetaInfo?: string | null;
    },
    mainDbName: string,
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

  /**
   * 重建所有项目的向量表（维度变化时调用）
   */
  async reinitAllVecTables(dimensions: number): Promise<boolean> {
    log.info(
      `[VibeLearningIndexQueue] Reinit all vec tables with dimensions: ${dimensions}`,
    );

    try {
      // 清除 embedding 配置缓存，下次会重新读取
      this.clearEmbeddingConfigCache();

      // 更新 VibeLearningDBManager 的维度配置
      vibeLearningDBManager.setVecDimensions(dimensions);

      // 获取当前数据库
      const databaseModule = (await import("./database")).default;
      const currentDbName = databaseModule.getCurrentDatabaseName();
      const db = databaseModule.getDatabase(currentDbName);

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
      for (const project of projects) {
        vibeLearningDBManager.reinitVecTable(
          currentDbName,
          project.id,
          dimensions,
        );
      }

      log.info(
        `[VibeLearningIndexQueue] Reinit vec tables for ${projects.length} projects`,
      );
      return true;
    } catch (error) {
      log.error(`[VibeLearningIndexQueue] Error reinit vec tables: ${error}`);
      return false;
    }
  }

  /**
   * 重新 embedding 所有资源
   */
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

      // 获取当前数据库
      const databaseModule = (await import("./database")).default;
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
      const VibeLearningResourceTable = (
        await import("./tables/vibe-learning-resource")
      ).default;
      const allResources = VibeLearningResourceTable.getAllResources(db);

      log.info(
        `[VibeLearningIndexQueue] Adding embedding tasks for ${allResources.length} resources`,
      );

      // 为每个有 markdown 的资源添加 embedding 任务
      for (const resource of allResources) {
        if (resource.markdownPath) {
          this.addTask({
            resourceId: resource.id,
            projectId: resource.projectId,
            mainDbName: currentDbName,
            originalPath: resource.originalPath,
            resourceName: resource.name,
            markdownPath: resource.markdownPath,
            type: "embedding_only",
          });
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
