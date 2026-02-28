import { app, ipcMain } from "electron";
import path from "path";
import pythonService from "./python-service";
import { Module } from "../types/module";
import { getFriendlyPythonRuntimeErrorMessage } from "../utils/python-runtime-error-message";

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

export interface SearchModelInfo {
  name: string;
  kind: "query_expander" | "reranker";
  label: string;
  description: string;
  size: string;
  recommended?: boolean;
  downloaded: boolean;
  modelscope: string;
  huggingface: string;
}

export interface SearchDownloadProgress {
  modelName: string;
  type: "progress";
  percentage: number;
  message: string;
  downloadedBytes?: number;
  totalBytes?: number;
  source?: EmbeddingDownloadSource;
}

export interface SearchDownloadResult {
  success: boolean;
  model_dir?: string;
  error?: string;
}

interface SearchDownloadTask {
  modelName: string;
  source: EmbeddingDownloadSource;
}

class EmbeddingModelManagerService {
  private modelsDir: string;
  private searchModelsDir: string;
  private activeDownloads: Map<string, EmbeddingDownloadTask>;
  private activeSearchDownloads: Map<string, SearchDownloadTask>;

  constructor() {
    this.modelsDir = path.join(app.getPath("userData"), "embedding-models");
    this.searchModelsDir = path.join(app.getPath("userData"), "search-models");
    this.activeDownloads = new Map();
    this.activeSearchDownloads = new Map();
  }

  getModelsDir() {
    return this.modelsDir;
  }

  getSearchModelsDir() {
    return this.searchModelsDir;
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

  async getSearchModels(): Promise<SearchModelInfo[]> {
    const client = await pythonService.ensureStarted();
    const result = await client.request<{ models?: SearchModelInfo[] }>(
      "list_search_models",
      {
        modelsDir: this.searchModelsDir,
      },
    );
    return result.models || [];
  }

  async downloadSearchModel(
    modelName: string,
    source: EmbeddingDownloadSource,
    onProgress?: (progress: SearchDownloadProgress) => void,
  ): Promise<SearchDownloadResult> {
    if (this.activeSearchDownloads.has(modelName)) {
      return {
        success: false,
        error: `Search model ${modelName} is already being downloaded`,
      };
    }

    this.activeSearchDownloads.set(modelName, { modelName, source });

    try {
      const client = await pythonService.ensureStarted();
      const result = await client.requestWithProgress<SearchDownloadResult>(
        "download_search_model",
        {
          source,
          modelName,
          outputDir: this.searchModelsDir,
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
      this.activeSearchDownloads.delete(modelName);
    }
  }

  async cancelSearchDownload(modelName: string): Promise<boolean> {
    const task = this.activeSearchDownloads.get(modelName);
    if (!task) {
      return false;
    }

    this.activeSearchDownloads.delete(modelName);

    try {
      const client = pythonService.getClient();
      if (client && client.isConnected()) {
        await client.request("cancel_search_download", {
          source: task.source,
          modelName: task.modelName,
        });
      }
    } catch (error) {
      console.warn(
        "[EmbeddingModelManager] Failed to send search cancel request:",
        error,
      );
    }

    return true;
  }

  async deleteSearchModel(modelName: string): Promise<boolean> {
    const client = await pythonService.ensureStarted();
    const result = await client.request<{ success?: boolean }>(
      "delete_search_model",
      {
        modelName,
        modelsDir: this.searchModelsDir,
      },
    );
    return !!result.success;
  }

  async isSearchModelDownloaded(modelName: string): Promise<boolean> {
    const client = await pythonService.ensureStarted();
    const result = await client.request<{ downloaded?: boolean }>(
      "check_search_model",
      {
        modelName,
        modelsDir: this.searchModelsDir,
      },
    );
    return !!result.downloaded;
  }

  async getDownloadedSearchModels(): Promise<string[]> {
    const client = await pythonService.ensureStarted();
    const result = await client.request<{ downloaded_models?: string[] }>(
      "get_downloaded_search_models",
      {
        modelsDir: this.searchModelsDir,
      },
    );
    return result.downloaded_models || [];
  }

  isSearchDownloading(modelName: string): boolean {
    return this.activeSearchDownloads.has(modelName);
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
          error: getFriendlyPythonRuntimeErrorMessage(
            error,
            "获取模型列表失败",
          ),
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
            error: getFriendlyPythonRuntimeErrorMessage(error, "模型下载失败"),
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
            error: getFriendlyPythonRuntimeErrorMessage(error, "删除模型失败"),
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
            error: getFriendlyPythonRuntimeErrorMessage(
              error,
              "模型健康检查失败",
            ),
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

    ipcMain.handle("search-model-get-models", async () => {
      try {
        const models = await this.service.getSearchModels();
        return { success: true, data: models };
      } catch (error) {
        return {
          success: false,
          error: getFriendlyPythonRuntimeErrorMessage(
            error,
            "获取检索模型列表失败",
          ),
        };
      }
    });

    ipcMain.handle(
      "search-model-download",
      async (
        event,
        modelName: string,
        source: EmbeddingDownloadSource,
      ): Promise<SearchDownloadResult> => {
        try {
          return await this.service.downloadSearchModel(
            modelName,
            source,
            (progress) => {
              event.sender.send("search-model-download-progress", progress);
            },
          );
        } catch (error) {
          return {
            success: false,
            error: getFriendlyPythonRuntimeErrorMessage(
              error,
              "检索模型下载失败",
            ),
          };
        }
      },
    );

    ipcMain.handle("search-model-cancel", async (_event, modelName: string) => {
      const success = await this.service.cancelSearchDownload(modelName);
      return { success };
    });

    ipcMain.handle("search-model-get-dir", async () => {
      return this.service.getSearchModelsDir();
    });

    ipcMain.handle("search-model-delete", async (_event, modelName: string) => {
      try {
        const success = await this.service.deleteSearchModel(modelName);
        return { success };
      } catch (error) {
        return {
          success: false,
          error: getFriendlyPythonRuntimeErrorMessage(
            error,
            "删除检索模型失败",
          ),
        };
      }
    });

    ipcMain.handle(
      "search-model-is-downloaded",
      async (_event, modelName: string) => {
        return this.service.isSearchModelDownloaded(modelName);
      },
    );

    ipcMain.handle("search-model-get-downloaded", async () => {
      return this.service.getDownloadedSearchModels();
    });

    ipcMain.handle(
      "search-model-is-downloading",
      (_event, modelName: string) => {
        return this.service.isSearchDownloading(modelName);
      },
    );
  }
}

export default new EmbeddingModelManagerModule();
