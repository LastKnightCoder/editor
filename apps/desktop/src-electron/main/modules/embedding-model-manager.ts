import { app, ipcMain } from "electron";
import path from "path";
import fs from "fs-extra";
import log from "electron-log";
import localInference from "./local-inference";
import embeddingIndexOrchestrator from "./embedding-index-orchestrator";
import {
  EMBEDDING_MODELS,
  getEmbeddingModelEntry,
  GgufModelEntry,
} from "./local-inference/model-registry";
import {
  downloadRepoFiles,
  listRepoFiles,
  DownloadCancelledError,
  DownloadSource,
} from "../utils/model-download";
import { Module } from "../types/module";

export type EmbeddingDownloadSource = DownloadSource;

export interface EmbeddingModelInfo {
  name: string;
  label: string;
  description: string;
  size: string;
  dimensions: number;
  recommended?: boolean;
  downloaded: boolean;
  modelscope: string;
  huggingface: string;
}

export interface EmbeddingDownloadProgress {
  modelName: string;
  type: "progress";
  percentage: number;
  message: string;
  downloadedBytes?: number;
  totalBytes?: number;
  source?: EmbeddingDownloadSource;
}

export interface EmbeddingDownloadResult {
  success: boolean;
  model_dir?: string;
  error?: string;
}

interface DownloadContext {
  source: EmbeddingDownloadSource;
  controller: AbortController;
}

class EmbeddingModelManagerService {
  private modelsDir: string;
  private activeDownloads: Map<string, DownloadContext>;

  constructor() {
    this.modelsDir = path.join(app.getPath("userData"), "embedding-models");
    this.activeDownloads = new Map();
  }

  getModelsDir() {
    return this.modelsDir;
  }

  private isEntryDownloaded(modelsDir: string, entry: GgufModelEntry): boolean {
    return fs.existsSync(path.join(modelsDir, entry.name, entry.file));
  }

  private toEmbeddingModelInfo(entry: GgufModelEntry): EmbeddingModelInfo {
    return {
      name: entry.name,
      label: entry.label,
      description: entry.description,
      size: entry.size,
      dimensions: entry.dimensions || 0,
      recommended: entry.recommended,
      downloaded: this.isEntryDownloaded(this.modelsDir, entry),
      modelscope: entry.modelscope,
      huggingface: entry.huggingface,
    };
  }

  /**
   * 从指定源下载注册表中的单个 GGUF 模型文件
   */
  private async downloadGgufModel(options: {
    entry: GgufModelEntry;
    source: EmbeddingDownloadSource;
    outputDir: string;
    onProgress?: (progress: Omit<EmbeddingDownloadProgress, "modelName">) => void;
    controller: AbortController;
  }): Promise<EmbeddingDownloadResult> {
    const { entry, source, outputDir, onProgress, controller } = options;

    const repoId = source === "modelscope" ? entry.modelscope : entry.huggingface;
    const filePath = source === "modelscope" ? entry.modelscopePath : entry.huggingfacePath;

    // 先列出仓库文件以获取大小（用于真实百分比）
    const repoFiles = await listRepoFiles(source, repoId, controller.signal);
    const target = repoFiles.find(file => file.path === filePath);
    if (!target) {
      throw new Error(`模型文件 ${repoId}/${filePath} 不存在于 ${source}`);
    }

    try {
      await downloadRepoFiles({
        source,
        repoId,
        files: [target],
        targetDir: outputDir,
        rootDir: entry.name,
        onProgress: progress => {
          onProgress?.({
            type: "progress",
            percentage: progress.percentage,
            message: progress.message,
            downloadedBytes: progress.downloadedBytes,
            totalBytes: progress.totalBytes,
            source: progress.source,
          });
        },
        signal: controller.signal,
      });
      const modelDir = path.join(outputDir, entry.name);
      // 下载成功后恢复可能被跳过的索引重建
      embeddingIndexOrchestrator.notifyEmbeddingProviderReady();
      return { success: true, model_dir: modelDir };
    } catch (error) {
      if (error instanceof DownloadCancelledError || controller.signal.aborted) {
        return { success: false, error: "Download cancelled" };
      }
      throw error;
    }
  }

  async getModels(): Promise<EmbeddingModelInfo[]> {
    log.info("[EmbeddingModelManager] Fetch embedding model list", {
      modelsDir: this.modelsDir,
    });
    return Object.values(EMBEDDING_MODELS).map(entry => this.toEmbeddingModelInfo(entry));
  }

  async downloadModel(
    modelName: string,
    source: EmbeddingDownloadSource,
    onProgress?: (progress: EmbeddingDownloadProgress) => void
  ): Promise<EmbeddingDownloadResult> {
    if (this.activeDownloads.has(modelName)) {
      return {
        success: false,
        error: `Model ${modelName} is already being downloaded`,
      };
    }

    const entry = getEmbeddingModelEntry(modelName);
    if (!entry) {
      return { success: false, error: `Unknown embedding model: ${modelName}` };
    }

    const controller = new AbortController();
    this.activeDownloads.set(modelName, { source, controller });

    try {
      return await this.downloadGgufModel({
        entry,
        source,
        outputDir: this.modelsDir,
        controller,
        onProgress: progress => {
          onProgress?.({ modelName, ...progress });
        },
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this.activeDownloads.delete(modelName);
    }
  }

  async cancelDownload(modelName: string): Promise<boolean> {
    const task = this.activeDownloads.get(modelName);
    if (!task) {
      return false;
    }
    task.controller.abort();
    this.activeDownloads.delete(modelName);
    return true;
  }

  async deleteModel(modelName: string): Promise<boolean> {
    const entry = getEmbeddingModelEntry(modelName);
    if (!entry) {
      return false;
    }
    const modelDir = path.join(this.modelsDir, entry.name);
    if (!(await fs.pathExists(modelDir))) {
      return false;
    }
    await fs.remove(modelDir);
    return true;
  }

  async isModelDownloaded(modelName: string): Promise<boolean> {
    const entry = getEmbeddingModelEntry(modelName);
    if (!entry) {
      return false;
    }
    return this.isEntryDownloaded(this.modelsDir, entry);
  }

  async getDownloadedModels(): Promise<string[]> {
    const downloaded: string[] = [];
    for (const entry of Object.values(EMBEDDING_MODELS)) {
      if (this.isEntryDownloaded(this.modelsDir, entry)) {
        downloaded.push(entry.name);
      }
    }
    return downloaded;
  }

  async health(modelName: string, devicePolicy: "auto" | "cpu" | "cuda") {
    return localInference.embeddingHealth({
      modelDir: this.modelsDir,
      modelName,
      devicePolicy,
    });
  }

  isDownloading(modelName: string): boolean {
    return this.activeDownloads.has(modelName);
  }
}

class EmbeddingModelManagerModule implements Module {
  name: string;
  private service: EmbeddingModelManagerService;

  constructor() {
    this.name = "embedding-model-manager";
    this.service = new EmbeddingModelManagerService();
  }

  async init() {
    ipcMain.handle("embedding-model-get-models", async () => {
      try {
        const models = await this.service.getModels();
        return { success: true, data: models };
      } catch (error) {
        log.error("[EmbeddingModelManager] Failed to get embedding model list", {
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    ipcMain.handle(
      "embedding-model-download",
      async (
        event,
        modelName: string,
        source: EmbeddingDownloadSource
      ): Promise<EmbeddingDownloadResult> => {
        try {
          return await this.service.downloadModel(modelName, source, progress => {
            event.sender.send("embedding-model-download-progress", progress);
          });
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
    );

    ipcMain.handle("embedding-model-cancel", async (_event, modelName: string) => {
      const success = await this.service.cancelDownload(modelName);
      return { success };
    });

    ipcMain.handle("embedding-model-delete", async (_event, modelName: string) => {
      try {
        const success = await this.service.deleteModel(modelName);
        return { success };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    ipcMain.handle("embedding-model-get-dir", async () => {
      return this.service.getModelsDir();
    });

    ipcMain.handle(
      "embedding-model-health",
      async (_event, modelName: string, devicePolicy: "auto" | "cpu" | "cuda" = "auto") => {
        try {
          return await this.service.health(modelName, devicePolicy);
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
    );

    ipcMain.handle("embedding-model-is-downloaded", async (_event, modelName: string) => {
      return this.service.isModelDownloaded(modelName);
    });

    ipcMain.handle("embedding-model-get-downloaded", async () => {
      return this.service.getDownloadedModels();
    });

    ipcMain.handle("embedding-model-is-downloading", (_event, modelName: string) => {
      return this.service.isDownloading(modelName);
    });
  }
}

export default new EmbeddingModelManagerModule();
