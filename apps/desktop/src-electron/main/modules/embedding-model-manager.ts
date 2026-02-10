import { app, ipcMain } from "electron";
import path from "path";
import pythonService from "./python-service";
import { Module } from "../types/module";

export type EmbeddingDownloadSource = "modelscope" | "huggingface";

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

interface EmbeddingDownloadTask {
  modelName: string;
  source: EmbeddingDownloadSource;
}

class EmbeddingModelManagerService {
  private modelsDir: string;
  private activeDownloads: Map<string, EmbeddingDownloadTask>;

  constructor() {
    this.modelsDir = path.join(app.getPath("userData"), "embedding-models");
    this.activeDownloads = new Map();
  }

  getModelsDir() {
    return this.modelsDir;
  }

  async getModels(): Promise<EmbeddingModelInfo[]> {
    const client = await pythonService.ensureStarted();
    const result = await client.request<{ models?: EmbeddingModelInfo[] }>(
      "list_embedding_models",
      {
        modelsDir: this.modelsDir,
      },
    );

    return result.models || [];
  }

  async downloadModel(
    modelName: string,
    source: EmbeddingDownloadSource,
    onProgress?: (progress: EmbeddingDownloadProgress) => void,
  ): Promise<EmbeddingDownloadResult> {
    if (this.activeDownloads.has(modelName)) {
      return {
        success: false,
        error: `Model ${modelName} is already being downloaded`,
      };
    }

    this.activeDownloads.set(modelName, { modelName, source });

    try {
      const client = await pythonService.ensureStarted();

      const result = await client.requestWithProgress<EmbeddingDownloadResult>(
        "download_embedding_model",
        {
          source,
          modelName,
          outputDir: this.modelsDir,
        },
        (progressData) => {
          if (progressData?.percentage !== undefined && onProgress) {
            onProgress({
              modelName,
              type: "progress",
              percentage: progressData.percentage,
              message:
                (progressData.message as string) ||
                `下载中... ${progressData.percentage}%`,
              downloadedBytes:
                typeof progressData.downloadedBytes === "number"
                  ? (progressData.downloadedBytes as number)
                  : undefined,
              totalBytes:
                typeof progressData.totalBytes === "number"
                  ? (progressData.totalBytes as number)
                  : undefined,
              source:
                progressData.source === "modelscope" ||
                progressData.source === "huggingface"
                  ? (progressData.source as EmbeddingDownloadSource)
                  : source,
            });
          }
        },
      );

      return result;
    } finally {
      this.activeDownloads.delete(modelName);
    }
  }

  async cancelDownload(modelName: string): Promise<boolean> {
    const task = this.activeDownloads.get(modelName);
    if (!task) {
      return false;
    }

    this.activeDownloads.delete(modelName);

    try {
      const client = pythonService.getClient();
      if (client && client.isConnected()) {
        await client.request("cancel_embedding_download", {
          source: task.source,
          modelName: task.modelName,
        });
      }
    } catch (error) {
      console.warn(
        "[EmbeddingModelManager] Failed to send cancel request:",
        error,
      );
    }

    return true;
  }

  async deleteModel(modelName: string): Promise<boolean> {
    const client = await pythonService.ensureStarted();
    const result = await client.request<{ success?: boolean }>(
      "delete_embedding_model",
      {
        modelName,
        modelsDir: this.modelsDir,
      },
    );
    return !!result.success;
  }

  async isModelDownloaded(modelName: string): Promise<boolean> {
    const client = await pythonService.ensureStarted();
    const result = await client.request<{ downloaded?: boolean }>(
      "check_embedding_model",
      {
        modelName,
        modelsDir: this.modelsDir,
      },
    );
    return !!result.downloaded;
  }

  async getDownloadedModels(): Promise<string[]> {
    const client = await pythonService.ensureStarted();
    const result = await client.request<{ downloaded_models?: string[] }>(
      "get_downloaded_embedding_models",
      {
        modelsDir: this.modelsDir,
      },
    );
    return result.downloaded_models || [];
  }

  async health(modelName: string, devicePolicy: "auto" | "cpu" | "cuda") {
    const client = await pythonService.ensureStarted();
    return client.request<{
      success: boolean;
      health?: {
        loaded: boolean;
        model_path?: string;
        model_name?: string;
        device?: string;
        dimensions?: number;
      };
    }>("embedding_health", {
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
        return {
          success: false,
          error:
            error instanceof Error ? error.message : "Failed to get models",
        };
      }
    });

    ipcMain.handle(
      "embedding-model-download",
      async (
        event,
        modelName: string,
        source: EmbeddingDownloadSource,
      ): Promise<EmbeddingDownloadResult> => {
        try {
          return await this.service.downloadModel(
            modelName,
            source,
            (progress) => {
              event.sender.send("embedding-model-download-progress", progress);
            },
          );
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Download failed",
          };
        }
      },
    );

    ipcMain.handle(
      "embedding-model-cancel",
      async (_event, modelName: string) => {
        const success = await this.service.cancelDownload(modelName);
        return { success };
      },
    );

    ipcMain.handle(
      "embedding-model-delete",
      async (_event, modelName: string) => {
        try {
          const success = await this.service.deleteModel(modelName);
          return { success };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Delete failed",
          };
        }
      },
    );

    ipcMain.handle("embedding-model-get-dir", async () => {
      return this.service.getModelsDir();
    });

    ipcMain.handle(
      "embedding-model-health",
      async (
        _event,
        modelName: string,
        devicePolicy: "auto" | "cpu" | "cuda" = "auto",
      ) => {
        try {
          return await this.service.health(modelName, devicePolicy);
        } catch (error) {
          return {
            success: false,
            error:
              error instanceof Error ? error.message : "Health check failed",
          };
        }
      },
    );

    ipcMain.handle(
      "embedding-model-is-downloaded",
      async (_event, modelName: string) => {
        return this.service.isModelDownloaded(modelName);
      },
    );

    ipcMain.handle("embedding-model-get-downloaded", async () => {
      return this.service.getDownloadedModels();
    });

    ipcMain.handle(
      "embedding-model-is-downloading",
      (_event, modelName: string) => {
        return this.service.isDownloading(modelName);
      },
    );
  }
}

export default new EmbeddingModelManagerModule();
