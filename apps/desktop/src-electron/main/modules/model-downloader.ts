/**
 * 模型下载服务模块
 *
 * 功能:
 * - 从 ModelScope/HuggingFace 下载 Whisper 模型
 * - 下载预编译的 faster-whisper 程序
 * - 下载进度追踪
 * - 模型管理（列表、删除）
 */

import { ipcMain, app } from "electron";
import path from "path";
import fs from "fs-extra";
import https from "https";
import http from "http";
import { Module } from "../types/module";
// 使用 7zip-min 进行解压（vite 会复制二进制文件到 dist-electron/main/）
import sevenZip from "7zip-min";
import { downloadRepoFiles } from "../utils/model-download";

// ==================== 类型定义 ====================

export type DownloadSource = "modelscope" | "huggingface";

export interface ModelInfo {
  name: string;
  label: string;
  size: string;
  description: string;
  recommended?: boolean;
  downloaded: boolean;
  modelscope: string;
  huggingface: string;
}

export interface DownloadProgress {
  type: "progress";
  percentage: number;
  message: string;
}

export interface DownloadResult {
  success: boolean;
  model_dir?: string;
  error?: string;
}

// 预编译程序相关类型
export interface ProgramInfo {
  name: string;
  label: string;
  type: "GPU" | "CPU";
  size: string;
  downloadUrl: string;
  fileName: string;
  isArchive: boolean;
  executableName: string;
  extractDir?: string;
  downloaded: boolean;
  platforms?: string[];
  arch?: string[];
  engine?: "faster-whisper";
}

export interface ProgramDownloadProgress {
  programName: string;
  percentage: number;
  message: string;
  downloadedBytes: number;
  totalBytes: number;
}

// ==================== 预编译程序配置 ====================

export const PROGRAM_CONFIG: Record<string, Omit<ProgramInfo, "downloaded">> = {
  // ========== faster-whisper (Windows only) ==========
  "faster-whisper-xxl": {
    name: "faster-whisper-xxl",
    label: "GPU + CPU 版本",
    type: "GPU",
    size: "1.35GB",
    downloadUrl:
      "https://modelscope.cn/models/bkfengg/whisper-cpp/resolve/master/Faster-Whisper-XXL_r245.2_windows.7z",
    fileName: "Faster-Whisper-XXL_r245.2_windows.7z",
    isArchive: true,
    executableName: "faster-whisper-xxl.exe",
    extractDir: "Faster-Whisper-XXL",
    platforms: ["win32"],
    engine: "faster-whisper",
  },
  "faster-whisper-cpu": {
    name: "faster-whisper-cpu",
    label: "CPU 版本",
    type: "CPU",
    size: "78.7MB",
    downloadUrl:
      "https://modelscope.cn/models/bkfengg/whisper-cpp/resolve/master/whisper-faster.exe",
    fileName: "faster-whisper.exe",
    isArchive: false,
    executableName: "faster-whisper.exe",
    platforms: ["win32"],
    engine: "faster-whisper",
  },
};

// ==================== 模型配置 ====================

export const MODEL_CONFIG: Record<
  string,
  {
    modelscope: string;
    huggingface: string;
    /** 仅下载仓库内这些文件（缺省整仓下载）；whisper.cpp 镜像仓是多模型共仓，必须指定单文件 */
    modelscopeFiles?: string[];
    huggingfaceFiles?: string[];
    label: string;
    size: string;
    description: string;
    recommended?: boolean;
    /** 引擎：faster-whisper 使用 CTranslate2 模型（Windows 预编译程序），whisper-cpp 使用 ggml 模型（macOS） */
    engine: "faster-whisper" | "whisper-cpp";
    /** 模型内用于判断已下载的标志文件 */
    markerFile?: string;
    /** 平台门控（缺省为全平台） */
    platforms?: string[];
  }
> = {
  // ========== faster-whisper (CTranslate2 格式，Windows 预编译程序使用) ==========
  "faster-whisper-tiny": {
    modelscope: "pengzhendong/faster-whisper-tiny",
    huggingface: "Systran/faster-whisper-tiny",
    label: "Tiny",
    size: "75MB",
    description: "最快，准确度较低",
    engine: "faster-whisper",
    platforms: ["win32"],
  },
  "faster-whisper-base": {
    modelscope: "pengzhendong/faster-whisper-base",
    huggingface: "Systran/faster-whisper-base",
    label: "Base",
    size: "150MB",
    description: "推荐，平衡速度和准确度",
    recommended: true,
    engine: "faster-whisper",
    platforms: ["win32"],
  },
  "faster-whisper-small": {
    modelscope: "pengzhendong/faster-whisper-small",
    huggingface: "Systran/faster-whisper-small",
    label: "Small",
    size: "500MB",
    description: "更高准确度",
    engine: "faster-whisper",
    platforms: ["win32"],
  },
  "faster-whisper-medium": {
    modelscope: "pengzhendong/faster-whisper-medium",
    huggingface: "Systran/faster-whisper-medium",
    label: "Medium",
    size: "1.5GB",
    description: "专业级准确度",
    engine: "faster-whisper",
    platforms: ["win32"],
  },
  "faster-whisper-large-v1": {
    modelscope: "pengzhendong/faster-whisper-large-v1",
    huggingface: "Systran/faster-whisper-large-v1",
    label: "Large-v1",
    size: "3GB",
    description: "高准确度",
    engine: "faster-whisper",
    platforms: ["win32"],
  },
  "faster-whisper-large-v2": {
    modelscope: "pengzhendong/faster-whisper-large-v2",
    huggingface: "Systran/faster-whisper-large-v2",
    label: "Large-v2",
    size: "3GB",
    description: "更高准确度",
    engine: "faster-whisper",
    platforms: ["win32"],
  },
  "faster-whisper-large-v3": {
    modelscope: "pengzhendong/faster-whisper-large-v3",
    huggingface: "Systran/faster-whisper-large-v3",
    label: "Large-v3",
    size: "3GB",
    description: "最高准确度",
    engine: "faster-whisper",
    platforms: ["win32"],
  },
  // ========== whisper.cpp (ggml 格式，macOS 随包 whisper-cli 使用) ==========
  // 原 pengzhendong/whisper.cpp-* 分仓库已在 ModelScope 下架（record not found），
  // HF 的 ggerganov/whisper.<size> 分仓库也已合并进 ggerganov/whisper.cpp 单仓库，
  // 两端均改用共仓镜像 + 单文件下载（whisper.cpp-base 等镜像已实测可下载）
  "whisper-cpp-tiny": {
    modelscope: "iceCream2025/whisper.cpp",
    modelscopeFiles: ["ggml-tiny.bin"],
    huggingface: "ggerganov/whisper.cpp",
    huggingfaceFiles: ["ggml-tiny.bin"],
    label: "Tiny",
    size: "75MB",
    description: "最快，准确度较低",
    engine: "whisper-cpp",
    markerFile: "ggml-tiny.bin",
    platforms: ["darwin"],
  },
  "whisper-cpp-base": {
    modelscope: "iceCream2025/whisper.cpp",
    modelscopeFiles: ["ggml-base.bin"],
    huggingface: "ggerganov/whisper.cpp",
    huggingfaceFiles: ["ggml-base.bin"],
    label: "Base",
    size: "142MB",
    description: "推荐，平衡速度和准确度",
    recommended: true,
    engine: "whisper-cpp",
    markerFile: "ggml-base.bin",
    platforms: ["darwin"],
  },
  "whisper-cpp-small": {
    modelscope: "iceCream2025/whisper.cpp",
    modelscopeFiles: ["ggml-small.bin"],
    huggingface: "ggerganov/whisper.cpp",
    huggingfaceFiles: ["ggml-small.bin"],
    label: "Small",
    size: "466MB",
    description: "更高准确度",
    engine: "whisper-cpp",
    markerFile: "ggml-small.bin",
    platforms: ["darwin"],
  },
  "whisper-cpp-medium": {
    modelscope: "iceCream2025/whisper.cpp",
    modelscopeFiles: ["ggml-medium.bin"],
    huggingface: "ggerganov/whisper.cpp",
    huggingfaceFiles: ["ggml-medium.bin"],
    label: "Medium",
    size: "1.5GB",
    description: "专业级准确度",
    engine: "whisper-cpp",
    markerFile: "ggml-medium.bin",
    platforms: ["darwin"],
  },
  "whisper-cpp-large-v3": {
    modelscope: "iceCream2025/whisper.cpp",
    modelscopeFiles: ["ggml-large-v3.bin"],
    huggingface: "ggerganov/whisper.cpp",
    huggingfaceFiles: ["ggml-large-v3.bin"],
    label: "Large-v3",
    size: "3GB",
    description: "最高准确度",
    engine: "whisper-cpp",
    markerFile: "ggml-large-v3.bin",
    platforms: ["darwin"],
  },
};

// ==================== 模型下载服务类 ====================

/** 下载任务信息 */
interface DownloadTask {
  modelName: string;
  source: DownloadSource;
  controller: AbortController;
}

class ModelDownloaderService {
  private modelsDir: string;
  private activeDownloads: Map<string, DownloadTask>;

  constructor() {
    this.modelsDir = path.join(app.getPath("userData"), "models");
    this.activeDownloads = new Map();
  }

  /**
   * 下载模型仓库快照（ModelScope / HuggingFace）
   */
  async downloadModel(
    modelName: string,
    source: DownloadSource,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<DownloadResult> {
    const config = MODEL_CONFIG[modelName];
    if (!config) {
      return { success: false, error: `Unknown model: ${modelName}` };
    }

    const modelId = config[source];
    if (!modelId) {
      return {
        success: false,
        error: `Model ${modelName} not available on ${source}`,
      };
    }

    // 检查是否已在下载
    if (this.activeDownloads.has(modelName)) {
      return {
        success: false,
        error: `Model ${modelName} is already being downloaded`,
      };
    }

    console.log("[ModelDownloader] Downloading model via Node");

    const task: DownloadTask = { modelName, source, controller: new AbortController() };
    this.activeDownloads.set(modelName, task);

    try {
      const fileFilter = source === "modelscope" ? config.modelscopeFiles : config.huggingfaceFiles;
      const modelDir = await downloadRepoFiles({
        source,
        repoId: modelId,
        files: fileFilter?.map(filePath => ({ path: filePath })),
        targetDir: this.modelsDir,
        rootDir: modelName,
        onProgress: progress => {
          onProgress?.({
            type: "progress",
            percentage: progress.percentage,
            message: progress.message || `下载中... ${progress.percentage}%`,
          });
        },
        signal: task.controller.signal,
      });
      return { success: true, model_dir: modelDir };
    } catch (error) {
      if (task.controller.signal.aborted) {
        return { success: false, error: "Download cancelled" };
      }
      throw error;
    } finally {
      this.activeDownloads.delete(modelName);
    }
  }

  /**
   * 取消下载
   * 通过 WebSocket 发送取消请求到 Python 服务
   */
  async cancelDownload(modelName: string): Promise<boolean> {
    const task = this.activeDownloads.get(modelName);
    if (!task) {
      return false;
    }

    this.activeDownloads.delete(modelName);
    task.controller.abort();
    console.log(`[ModelDownloader] Download aborted: ${modelName}`);

    return true;
  }

  /**
   * 检查模型是否已下载
   */
  async isModelDownloaded(modelName: string): Promise<boolean> {
    const config = MODEL_CONFIG[modelName];
    const marker =
      config?.engine === "whisper-cpp" ? config.markerFile || "ggml-model.bin" : "model.bin";
    const modelPath = path.join(this.modelsDir, modelName, marker);
    return fs.pathExists(modelPath);
  }

  /**
   * 获取所有模型信息（包含下载状态，按平台过滤）
   */
  async getModels(): Promise<ModelInfo[]> {
    const models: ModelInfo[] = [];

    for (const [name, config] of Object.entries(MODEL_CONFIG)) {
      if (config.platforms && !config.platforms.includes(process.platform)) {
        continue;
      }
      const downloaded = await this.isModelDownloaded(name);
      models.push({
        name,
        label: config.label,
        size: config.size,
        description: config.description,
        recommended: config.recommended,
        downloaded,
        modelscope: config.modelscope,
        huggingface: config.huggingface,
      });
    }

    return models;
  }

  /**
   * 获取已下载的模型列表
   */
  async getDownloadedModels(): Promise<string[]> {
    const downloaded: string[] = [];

    for (const modelName of Object.keys(MODEL_CONFIG)) {
      if (await this.isModelDownloaded(modelName)) {
        downloaded.push(modelName);
      }
    }

    return downloaded;
  }

  /**
   * 删除模型
   */
  async deleteModel(modelName: string): Promise<boolean> {
    const modelPath = path.join(this.modelsDir, modelName);

    if (await fs.pathExists(modelPath)) {
      await fs.remove(modelPath);
      return true;
    }

    return false;
  }

  /**
   * 获取模型目录
   */
  getModelsDir(): string {
    return this.modelsDir;
  }

  /**
   * 获取模型大小（已下载的）
   */
  async getModelSize(modelName: string): Promise<number> {
    const modelPath = path.join(this.modelsDir, modelName);

    if (!(await fs.pathExists(modelPath))) {
      return 0;
    }

    let totalSize = 0;
    const files = await fs.readdir(modelPath);

    for (const file of files) {
      const filePath = path.join(modelPath, file);
      const stat = await fs.stat(filePath);
      if (stat.isFile()) {
        totalSize += stat.size;
      }
    }

    return totalSize;
  }

  /**
   * 检查是否正在下载
   */
  isDownloading(modelName: string): boolean {
    return this.activeDownloads.has(modelName);
  }

  /**
   * 获取正在下载的模型列表
   */
  getDownloadingModels(): string[] {
    return Array.from(this.activeDownloads.keys());
  }

  // ==================== 预编译程序相关方法 ====================

  /**
   * 获取程序目录
   */
  getProgramsDir(): string {
    return path.join(app.getPath("userData"), "bin");
  }

  /**
   * 检查程序是否已下载
   */
  async isProgramDownloaded(programName: string): Promise<boolean> {
    const config = PROGRAM_CONFIG[programName];
    if (!config) return false;

    const programsDir = this.getProgramsDir();

    if (config.isArchive && config.extractDir) {
      // 压缩包版本，检查解压后的目录
      const execPath = path.join(programsDir, config.extractDir, config.executableName);
      return fs.pathExists(execPath);
    } else {
      // 单文件版本
      const execPath = path.join(programsDir, config.executableName);
      return fs.pathExists(execPath);
    }
  }

  /**
   * 获取程序可执行文件路径
   */
  async getProgramExecutablePath(programName: string): Promise<string | null> {
    const config = PROGRAM_CONFIG[programName];
    if (!config) return null;

    const programsDir = this.getProgramsDir();

    if (config.isArchive && config.extractDir) {
      const execPath = path.join(programsDir, config.extractDir, config.executableName);
      if (await fs.pathExists(execPath)) {
        return execPath;
      }
    } else {
      const execPath = path.join(programsDir, config.executableName);
      if (await fs.pathExists(execPath)) {
        return execPath;
      }
    }

    return null;
  }

  /**
   * 获取已下载的程序类型列表
   */
  async getInstalledProgramTypes(): Promise<Array<"GPU" | "CPU">> {
    const types: Array<"GPU" | "CPU"> = [];

    for (const [name, config] of Object.entries(PROGRAM_CONFIG)) {
      if (await this.isProgramDownloaded(name)) {
        if (!types.includes(config.type)) {
          types.push(config.type);
        }
      }
    }

    return types;
  }

  /**
   * 获取所有程序信息（包含下载状态，按平台过滤）
   */
  async getPrograms(): Promise<ProgramInfo[]> {
    const programs: ProgramInfo[] = [];
    const currentPlatform = process.platform;
    const currentArch = process.arch;

    for (const [name, config] of Object.entries(PROGRAM_CONFIG)) {
      // 平台过滤
      if (config.platforms && !config.platforms.includes(currentPlatform)) {
        continue;
      }
      // 架构过滤
      if (config.arch && !config.arch.includes(currentArch)) {
        continue;
      }

      const downloaded = await this.isProgramDownloaded(name);
      programs.push({
        ...config,
        downloaded,
      });
    }

    return programs;
  }

  /**
   * 下载文件（带进度）
   * 参考 VideoCaptioner：先下载到临时目录，再移动到目标位置
   */
  private async downloadFile(
    url: string,
    destPath: string,
    onProgress?: (downloaded: number, total: number) => void
  ): Promise<void> {
    // 创建临时下载目录
    const tempDir = path.join(app.getPath("temp"), "tau-download-cache");
    await fs.ensureDir(tempDir);
    const tempFile = path.join(tempDir, path.basename(destPath));

    // 清理可能存在的旧临时文件
    if (await fs.pathExists(tempFile)) {
      try {
        await fs.unlink(tempFile);
      } catch (e) {
        console.log("[ModelDownloader] Failed to remove old temp file:", e);
      }
    }

    return new Promise((resolve, reject) => {
      let file: fs.WriteStream | null = null;

      const cleanup = () => {
        if (file) {
          file.close();
          file = null;
        }
      };

      const handleError = async (err: Error) => {
        cleanup();
        // 尝试删除临时文件（忽略删除失败的错误）
        try {
          await fs.unlink(tempFile);
        } catch {
          // 忽略删除失败
        }
        reject(err);
      };

      try {
        file = fs.createWriteStream(tempFile);
      } catch (err) {
        reject(new Error(`无法创建临时文件: ${err}`));
        return;
      }

      file.on("error", handleError);

      // 解析 URL 获取主机名
      const urlObj = new URL(url);

      // 添加必要的请求头（模拟浏览器请求，避免 403 错误）
      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "*/*",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          Referer: `${urlObj.protocol}//${urlObj.hostname}/`,
        },
      };

      const request = (urlObj.protocol === "https:" ? https : http).request(
        requestOptions,
        response => {
          // 处理重定向
          if (
            response.statusCode === 301 ||
            response.statusCode === 302 ||
            response.statusCode === 307 ||
            response.statusCode === 308
          ) {
            const redirectUrl = response.headers.location;
            if (redirectUrl) {
              cleanup();
              // 处理相对路径重定向
              const fullRedirectUrl = redirectUrl.startsWith("http")
                ? redirectUrl
                : `${urlObj.protocol}//${urlObj.hostname}${redirectUrl}`;
              this.downloadFile(fullRedirectUrl, destPath, onProgress).then(resolve).catch(reject);
              return;
            }
          }

          if (response.statusCode !== 200) {
            handleError(new Error(`Download failed with status ${response.statusCode}`));
            return;
          }

          const totalSize = parseInt(response.headers["content-length"] || "0", 10);
          let downloadedSize = 0;

          response.on("data", (chunk: Buffer) => {
            downloadedSize += chunk.length;
            if (onProgress) {
              onProgress(downloadedSize, totalSize);
            }
          });

          // file 在此处一定存在，因为如果创建失败会提前 return
          const writeStream = file;
          if (!writeStream) {
            handleError(new Error("Write stream not initialized"));
            return;
          }

          response.pipe(writeStream);

          writeStream.on("finish", async () => {
            cleanup();

            try {
              // 确保目标目录存在
              await fs.ensureDir(path.dirname(destPath));

              // 如果目标文件已存在，先删除
              if (await fs.pathExists(destPath)) {
                await fs.unlink(destPath);
              }

              // 移动文件到目标位置
              await fs.move(tempFile, destPath, { overwrite: true });
              resolve();
            } catch (err) {
              reject(new Error(`移动文件失败: ${err}`));
            }
          });
        }
      );

      request.on("error", handleError);
      request.end();
    });
  }

  /**
   * 解压 7z 文件（使用 7zip-min）
   */
  private async extract7z(archivePath: string, destDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      sevenZip.unpack(archivePath, destDir, (err: Error | null) => {
        if (err) {
          reject(new Error(`解压失败: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 下载预编译程序
   */
  async downloadProgram(
    programName: string,
    onProgress?: (progress: ProgramDownloadProgress) => void
  ): Promise<DownloadResult> {
    const config = PROGRAM_CONFIG[programName];
    if (!config) {
      return { success: false, error: `Unknown program: ${programName}` };
    }

    const programsDir = this.getProgramsDir();
    await fs.ensureDir(programsDir);

    const downloadPath = path.join(programsDir, config.fileName);

    try {
      // 下载文件
      console.log(`[ModelDownloader] Downloading program: ${config.downloadUrl}`);

      await this.downloadFile(config.downloadUrl, downloadPath, (downloaded, total) => {
        if (onProgress) {
          const percentage = total > 0 ? Math.round((downloaded / total) * 100) : 0;
          onProgress({
            programName,
            percentage,
            message: `下载中... ${(downloaded / 1024 / 1024).toFixed(1)}MB / ${(total / 1024 / 1024).toFixed(1)}MB`,
            downloadedBytes: downloaded,
            totalBytes: total,
          });
        }
      });

      // 如果是压缩包，需要解压
      if (config.isArchive) {
        if (onProgress) {
          onProgress({
            programName,
            percentage: 100,
            message: "正在解压...",
            downloadedBytes: 0,
            totalBytes: 0,
          });
        }

        await this.extract7z(downloadPath, programsDir);

        // 删除压缩包
        await fs.unlink(downloadPath);
      }

      console.log(`[ModelDownloader] Program downloaded successfully: ${programName}`);
      return { success: true };
    } catch (error) {
      console.error(`[ModelDownloader] Program download error:`, error);
      // 清理失败的下载（忽略删除失败）
      await fs.unlink(downloadPath).catch(() => {
        // 忽略删除失败
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 删除程序
   */
  async deleteProgram(programName: string): Promise<boolean> {
    const config = PROGRAM_CONFIG[programName];
    if (!config) return false;

    const programsDir = this.getProgramsDir();

    try {
      if (config.isArchive && config.extractDir) {
        // 压缩包版本，删除整个目录
        const dirPath = path.join(programsDir, config.extractDir);
        if (await fs.pathExists(dirPath)) {
          await fs.remove(dirPath);
          return true;
        }
      } else {
        // 单文件版本，删除文件
        const filePath = path.join(programsDir, config.executableName);
        if (await fs.pathExists(filePath)) {
          await fs.unlink(filePath);
          return true;
        }
      }
    } catch (error) {
      console.error(`[ModelDownloader] Delete program error:`, error);
    }

    return false;
  }
}

// ==================== 模块定义 ====================

class ModelDownloaderModule implements Module {
  name: string;
  private service: ModelDownloaderService;

  constructor() {
    this.name = "model-downloader";
    this.service = new ModelDownloaderService();
  }

  async init() {
    // 获取所有模型信息
    ipcMain.handle("model-downloader-get-models", async () => {
      try {
        const models = await this.service.getModels();
        return { success: true, data: models };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // 下载模型
    ipcMain.handle(
      "model-downloader-download",
      async (event, modelName: string, source: DownloadSource) => {
        try {
          console.log(`[ModelDownloader] Starting download: ${modelName} from ${source}`);
          const result = await this.service.downloadModel(modelName, source, progress => {
            // 发送进度到渲染进程
            console.log(`[ModelDownloader] Sending progress:`, {
              modelName,
              ...progress,
            });
            event.sender.send("model-download-progress", {
              modelName,
              ...progress,
            });
          });
          console.log(`[ModelDownloader] Download completed:`, result);
          return result;
        } catch (error) {
          console.error(`[ModelDownloader] Download error:`, error);
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
    );

    // 取消下载
    ipcMain.handle("model-downloader-cancel", async (_event, modelName: string) => {
      const cancelled = this.service.cancelDownload(modelName);
      return { success: cancelled };
    });

    // 检查模型是否已下载
    ipcMain.handle("model-downloader-is-downloaded", async (_event, modelName: string) => {
      return this.service.isModelDownloaded(modelName);
    });

    // 获取已下载的模型
    ipcMain.handle("model-downloader-get-downloaded", async () => {
      return this.service.getDownloadedModels();
    });

    // 删除模型
    ipcMain.handle("model-downloader-delete", async (_event, modelName: string) => {
      try {
        const deleted = await this.service.deleteModel(modelName);
        return { success: deleted };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // 获取模型目录
    ipcMain.handle("model-downloader-get-dir", () => {
      return this.service.getModelsDir();
    });

    // 获取模型大小
    ipcMain.handle("model-downloader-get-size", async (_event, modelName: string) => {
      return this.service.getModelSize(modelName);
    });

    // 检查是否正在下载
    ipcMain.handle("model-downloader-is-downloading", (_event, modelName: string) => {
      return this.service.isDownloading(modelName);
    });

    // 获取正在下载的模型列表
    ipcMain.handle("model-downloader-get-downloading", () => {
      return this.service.getDownloadingModels();
    });

    // ==================== 预编译程序相关 IPC ====================

    // 获取所有程序信息
    ipcMain.handle("program-downloader-get-programs", async () => {
      try {
        const programs = await this.service.getPrograms();
        return { success: true, data: programs };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // 下载程序
    ipcMain.handle("program-downloader-download", async (event, programName: string) => {
      try {
        console.log(`[ModelDownloader] Starting program download: ${programName}`);
        const result = await this.service.downloadProgram(programName, progress => {
          // 发送进度到渲染进程
          event.sender.send("program-download-progress", progress);
        });
        console.log(`[ModelDownloader] Program download completed:`, result);
        return result;
      } catch (error) {
        console.error(`[ModelDownloader] Program download error:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // 检查程序是否已下载
    ipcMain.handle("program-downloader-is-downloaded", async (_event, programName: string) => {
      return this.service.isProgramDownloaded(programName);
    });

    // 获取程序可执行文件路径
    ipcMain.handle(
      "program-downloader-get-executable-path",
      async (_event, programName: string) => {
        return this.service.getProgramExecutablePath(programName);
      }
    );

    // 获取已安装的程序类型
    ipcMain.handle("program-downloader-get-installed-types", async () => {
      return this.service.getInstalledProgramTypes();
    });

    // 删除程序
    ipcMain.handle("program-downloader-delete", async (_event, programName: string) => {
      try {
        const deleted = await this.service.deleteProgram(programName);
        return { success: deleted };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // 获取程序目录
    ipcMain.handle("program-downloader-get-dir", () => {
      return this.service.getProgramsDir();
    });
  }
}

export default new ModelDownloaderModule();
