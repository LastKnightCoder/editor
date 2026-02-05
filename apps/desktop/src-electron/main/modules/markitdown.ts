/**
 * MarkItDown 文件转换模块
 *
 * 功能:
 * - 接收文件内容并保存为临时文件
 * - 调用 Python 服务进行 Markdown 转换
 * - 支持音视频文件转录并转换为 Markdown
 * - 返回结果并清理临时文件
 */

import { ipcMain, BrowserWindow } from "electron";
import { Module } from "../types/module";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";
import pythonService from "./python-service";
import MediaUtil from "../utils/MediaUtil";

// ==================== 文件类型定义 ====================

/** 支持的音频文件扩展名 */
const AUDIO_EXTENSIONS = [
  ".mp3",
  ".wav",
  ".m4a",
  ".ogg",
  ".flac",
  ".aac",
  ".wma",
];

/** 支持的视频文件扩展名 */
const VIDEO_EXTENSIONS = [
  ".mp4",
  ".webm",
  ".mov",
  ".avi",
  ".mkv",
  ".wmv",
  ".flv",
];

/**
 * 检查是否为音频文件
 */
function isAudioFile(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return AUDIO_EXTENSIONS.includes(ext);
}

/**
 * 检查是否为视频文件
 */
function isVideoFile(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return VIDEO_EXTENSIONS.includes(ext);
}

/**
 * 检查是否为媒体文件（音频或视频）
 */
function isMediaFile(fileName: string): boolean {
  return isAudioFile(fileName) || isVideoFile(fileName);
}

interface ConvertFileParams {
  /** 文件内容 (base64 编码) - 与 filePath 二选一 */
  fileContent?: string;
  /** 原始文件名 */
  fileName: string;
  /** 文件路径 - 与 fileContent 二选一，直接使用此路径转换，处理后不删除 */
  filePath?: string;
  /** LLM 提供商（用于图片描述等） */
  llmProvider?: string;
  /** LLM API Key */
  llmApiKey?: string;
  /** LLM 模型 */
  llmModel?: string;
  /** 自定义提示词 */
  llmPrompt?: string;
  /** 自定义 API 地址 */
  llmBaseUrl?: string;
  /** Azure Document Intelligence 端点 */
  docIntelEndpoint?: string;
  /** 是否启用插件 */
  enablePlugins?: boolean;
  // ==================== 音视频转录参数 ====================
  /** 转录语言 (如 zh, en) */
  transcriptionLanguage?: string;
  /** Whisper 模型大小 (tiny, base, small, medium, large-v1, large-v2, large-v3) */
  transcriptionModel?: string;
  /** 转录模型目录 */
  transcriptionModelDir?: string;
  /** 是否启用词级时间戳 */
  transcriptionWordTimestamps?: boolean;
  // ==================== 转录 LLM 断句优化参数 ====================
  /** 转录 LLM 提供商 */
  transcriptionLLMProvider?: string;
  /** 转录 LLM API Key */
  transcriptionLLMApiKey?: string;
  /** 转录 LLM 模型 */
  transcriptionLLMModel?: string;
  /** 转录 LLM API 地址 */
  transcriptionLLMBaseUrl?: string;
}

/** 转录段落 */
interface TranscriptionSegment {
  text: string;
  start: number; // 毫秒
  end: number; // 毫秒
}

/** 转录结果 */
interface TranscriptionResult {
  text: string;
  language: string;
  segments: TranscriptionSegment[];
  wordSegments?: TranscriptionSegment[];
}

/** LLM 转录优化结果 */
interface OptimizeTranscriptionResult {
  markdown: string;
}

interface ConvertFileResult {
  success: boolean;
  textContent: string | null;
  title: string | null;
  filePath: string;
  error: string | null;
}

class MarkItDownModule implements Module {
  name: string;
  private tempDir: string | null = null;

  constructor() {
    this.name = "markitdown";
  }

  async init() {
    // 创建临时目录
    this.tempDir = path.join(os.tmpdir(), "tau-markitdown");
    await fs.mkdir(this.tempDir, { recursive: true });

    // 注册 IPC 处理器
    ipcMain.handle(
      "markitdown-convert",
      async (_event, params: ConvertFileParams) => {
        return this.convertFile(params);
      },
    );

    console.log("[MarkItDown] Module initialized, temp dir:", this.tempDir);
  }

  /**
   * 发送进度通知到所有渲染进程
   */
  private sendProgress(stage: string, progress: number, message: string) {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send("markitdown-progress", { stage, progress, message });
    }
  }

  /**
   * 转换文件（统一入口）
   */
  async convertFile(params: ConvertFileParams): Promise<ConvertFileResult> {
    const { fileName } = params;

    // 检查是否为音视频文件
    if (isMediaFile(fileName)) {
      console.log(
        "[MarkItDown] Detected media file, using transcription flow:",
        fileName,
      );
      return this.convertMediaFile(params);
    }

    // 普通文件走 MarkItDown 流程
    return this.convertRegularFile(params);
  }

  /**
   * 转换普通文件（PDF、Word、图片等）
   */
  async convertRegularFile(
    params: ConvertFileParams,
  ): Promise<ConvertFileResult> {
    const {
      fileContent,
      fileName,
      filePath,
      llmProvider,
      llmApiKey,
      llmModel,
      llmPrompt,
      llmBaseUrl,
      docIntelEndpoint,
      enablePlugins,
    } = params;

    let targetFilePath: string | null = null;
    let originalTempFilePath: string | null = null; // 原始临时文件路径（用于清理）
    let convertedWebpPath: string | null = null; // webp 转换后的临时文件

    try {
      // 1. 确定文件路径
      if (filePath) {
        // 直接使用传入的文件路径，不需要清理
        targetFilePath = filePath;
        console.log("[MarkItDown] Using provided file path:", targetFilePath);
      } else if (fileContent) {
        // 从 base64 内容创建临时文件，需要清理
        if (!this.tempDir) {
          throw new Error("Temp directory not initialized");
        }
        const fileExt = path.extname(fileName);
        const tempFileName = `${uuidv4()}${fileExt}`;
        targetFilePath = path.join(this.tempDir, tempFileName);

        const fileBuffer = Buffer.from(fileContent, "base64");
        await fs.writeFile(targetFilePath, fileBuffer);
        originalTempFilePath = targetFilePath; // 保存原始临时文件路径用于清理
        console.log("[MarkItDown] Saved temp file:", targetFilePath);
      } else {
        throw new Error("Either filePath or fileContent must be provided");
      }

      // 1.5 处理 webp 格式：markitdown 不支持 webp，需要先转换为 png
      const fileExt = path.extname(targetFilePath).toLowerCase();
      if (fileExt === ".webp" && this.tempDir) {
        const pngFileName = `${uuidv4()}.png`;
        convertedWebpPath = path.join(this.tempDir, pngFileName);
        await sharp(targetFilePath).png().toFile(convertedWebpPath);
        console.log("[MarkItDown] Converted webp to png:", convertedWebpPath);
        targetFilePath = convertedWebpPath;
      }

      // 2. 调用 Python 服务进行转换
      const client = await pythonService.ensureStarted();

      const pythonParams: Record<string, unknown> = {
        filePath: targetFilePath,
      };

      if (llmProvider) pythonParams.llmProvider = llmProvider;
      if (llmApiKey) pythonParams.llmApiKey = llmApiKey;
      if (llmModel) pythonParams.llmModel = llmModel;
      if (llmPrompt) pythonParams.llmPrompt = llmPrompt;
      if (llmBaseUrl) pythonParams.llmBaseUrl = llmBaseUrl;
      if (docIntelEndpoint) pythonParams.docIntelEndpoint = docIntelEndpoint;
      if (enablePlugins) pythonParams.enablePlugins = enablePlugins;
      const result = await client.request<ConvertFileResult>(
        "convert_file",
        pythonParams,
      );

      console.log("[MarkItDown] Conversion result:", {
        success: result.success,
        hasContent: !!result.textContent,
        title: result.title,
      });

      return {
        ...result,
        filePath: fileName, // 返回原始文件名而不是临时路径
      };
    } catch (error) {
      console.error("[MarkItDown] Conversion error:", error);
      return {
        success: false,
        textContent: null,
        title: null,
        filePath: fileName,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      // 3. 清理临时文件
      // 清理 webp 转换后的 png 临时文件
      if (convertedWebpPath) {
        try {
          await fs.unlink(convertedWebpPath);
          console.log("[MarkItDown] Cleaned up webp file:", convertedWebpPath);
        } catch (e) {
          console.warn("[MarkItDown] Failed to clean up webp file:", e);
        }
      }
      // 清理原始临时文件（仅当使用 fileContent 创建的临时文件时）
      if (originalTempFilePath) {
        try {
          await fs.unlink(originalTempFilePath);
          console.log(
            "[MarkItDown] Cleaned up temp file:",
            originalTempFilePath,
          );
        } catch (e) {
          console.warn("[MarkItDown] Failed to clean up temp file:", e);
        }
      }
    }
  }

  /**
   * 转换音视频文件
   * 流程: 视频提取音频 → 转录 → LLM断句 → 格式化Markdown
   */
  async convertMediaFile(
    params: ConvertFileParams,
  ): Promise<ConvertFileResult> {
    const {
      fileContent,
      fileName,
      filePath,
      transcriptionLanguage = "zh",
      transcriptionModel = "base",
      transcriptionModelDir,
      transcriptionWordTimestamps = false,
      // 转录 LLM 断句优化配置
      transcriptionLLMProvider,
      transcriptionLLMApiKey,
      transcriptionLLMModel,
      transcriptionLLMBaseUrl,
    } = params;

    let mediaFilePath: string | null = null;
    let audioFilePath: string | null = null;
    let shouldCleanupMedia = false; // 标记是否需要清理原始媒体文件

    try {
      // 1. 确定媒体文件路径
      if (filePath) {
        // 直接使用传入的文件路径，不需要清理
        mediaFilePath = filePath;
        shouldCleanupMedia = false;
        console.log(
          "[MarkItDown] Using provided media file path:",
          mediaFilePath,
        );
      } else if (fileContent) {
        // 从 base64 内容创建临时文件，需要清理
        if (!this.tempDir) {
          throw new Error("Temp directory not initialized");
        }
        const fileExt = path.extname(fileName);
        const tempFileName = `${uuidv4()}${fileExt}`;
        mediaFilePath = path.join(this.tempDir, tempFileName);

        const fileBuffer = Buffer.from(fileContent, "base64");
        await fs.writeFile(mediaFilePath, fileBuffer);
        shouldCleanupMedia = true;
        console.log("[MarkItDown] Saved media temp file:", mediaFilePath);
      } else {
        throw new Error("Either filePath or fileContent must be provided");
      }

      this.sendProgress("extracting", 0, "准备处理媒体文件...");

      // 2. 如果是视频，提取音频
      if (isVideoFile(fileName)) {
        this.sendProgress("extracting", 10, "正在从视频中提取音频...");
        if (!this.tempDir) {
          throw new Error("Temp directory not initialized");
        }
        audioFilePath = path.join(this.tempDir, `${uuidv4()}.mp3`);

        await MediaUtil.extractAudioForTranscription(
          mediaFilePath,
          audioFilePath,
          (progress) => {
            this.sendProgress(
              "extracting",
              10 + progress * 0.2,
              `正在提取音频... ${Math.round(progress)}%`,
            );
          },
        );

        console.log("[MarkItDown] Extracted audio:", audioFilePath);
      } else {
        // 音频文件直接使用，音频路径指向原始文件
        audioFilePath = mediaFilePath;
        // 如果是直接传入的路径，音频文件不应被清理
        // 如果是从 base64 创建的临时文件，需要清理（但此时 audioFilePath 和 mediaFilePath 是同一个文件）
      }

      // 3. 调用转录服务
      this.sendProgress("transcribing", 30, "正在转录音频...");
      const client = await pythonService.ensureStarted();

      const transcribeResult =
        await client.requestWithProgress<TranscriptionResult>(
          "transcribe",
          {
            audioPath: audioFilePath,
            model: transcriptionModel,
            language: transcriptionLanguage,
            // 不传递 device，让后端自动使用默认值（Mac 用 cpu，Windows 根据已安装程序检测）
            computeType: "auto",
            wordTimestamps: transcriptionWordTimestamps,
            vadFilter: true,
            modelDir: transcriptionModelDir,
          },
          (progressData) => {
            if (progressData?.percentage !== undefined) {
              this.sendProgress(
                "transcribing",
                30 + progressData.percentage * 0.3,
                `正在转录... ${progressData.percentage}%`,
              );
            }
          },
        );

      console.log("[MarkItDown] Transcription completed:", {
        language: transcribeResult.language,
        segmentsCount: transcribeResult.segments?.length,
      });

      // 4. 生成 Markdown
      // 如果配置了 LLM，使用 LLM 将转录文本整理为 Markdown
      // 否则使用简单格式化（带时间戳）
      const segments = transcribeResult.segments || [];
      const hasLLMConfig =
        transcriptionLLMProvider &&
        transcriptionLLMApiKey &&
        transcriptionLLMModel;

      let markdown: string;

      if (hasLLMConfig && segments.length > 0) {
        this.sendProgress("optimizing", 60, "正在使用 AI 整理文档...");

        try {
          const optimizeResult =
            await client.request<OptimizeTranscriptionResult>(
              "optimize_transcription",
              {
                // 传递句子级别的 segments（Python 端统一使用 wordSegments 参数名）
                wordSegments: segments,
                language: transcribeResult.language || transcriptionLanguage,
                llmProvider: transcriptionLLMProvider,
                llmApiKey: transcriptionLLMApiKey,
                llmModel: transcriptionLLMModel,
                llmBaseUrl: transcriptionLLMBaseUrl,
              },
            );

          markdown = optimizeResult.markdown;
          console.log(
            "[MarkItDown] LLM generated Markdown:",
            markdown.length,
            "chars",
          );
        } catch (error) {
          console.warn(
            "[MarkItDown] LLM optimization failed, using fallback format:",
            error,
          );
          // 如果 LLM 优化失败，使用简单格式化
          markdown = this.formatTranscriptionToMarkdown(
            fileName,
            segments,
            transcribeResult.language || transcriptionLanguage,
          );
        }
      } else {
        // 没有配置 LLM，使用简单格式化（带时间戳）
        console.log(
          "[MarkItDown] Using fallback format (no LLM config):",
          segments.length,
          "segments",
        );
        this.sendProgress("formatting", 90, "正在生成 Markdown...");
        markdown = this.formatTranscriptionToMarkdown(
          fileName,
          segments,
          transcribeResult.language || transcriptionLanguage,
        );
      }

      this.sendProgress("formatting", 100, "转换完成");

      return {
        success: true,
        textContent: markdown,
        title: path.basename(fileName, path.extname(fileName)),
        filePath: fileName,
        error: null,
      };
    } catch (error) {
      console.error("[MarkItDown] Media conversion error:", error);
      return {
        success: false,
        textContent: null,
        title: null,
        filePath: fileName,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      // 清理临时文件
      const filesToClean: string[] = [];

      // 如果是视频文件，提取的音频文件始终需要清理（它是临时创建的）
      // 如果是音频文件，audioFilePath 和 mediaFilePath 是同一个文件
      if (isVideoFile(fileName) && audioFilePath) {
        filesToClean.push(audioFilePath);
      }

      // 原始媒体文件只有在从 base64 创建时才需要清理
      if (shouldCleanupMedia && mediaFilePath) {
        // 避免重复添加（当音频文件和媒体文件是同一个时）
        if (!filesToClean.includes(mediaFilePath)) {
          filesToClean.push(mediaFilePath);
        }
      }

      for (const fileToClean of filesToClean) {
        try {
          await fs.unlink(fileToClean);
          console.log("[MarkItDown] Cleaned up temp file:", fileToClean);
        } catch (e) {
          console.warn("[MarkItDown] Failed to clean up temp file:", e);
        }
      }
    }
  }

  /**
   * 将转录结果格式化为 Markdown（fallback，无 LLM 时使用）
   */
  private formatTranscriptionToMarkdown(
    fileName: string,
    segments: TranscriptionSegment[],
    language: string,
  ): string {
    const title = path.basename(fileName, path.extname(fileName));
    const isVideo = isVideoFile(fileName);
    const mediaType = isVideo ? "视频" : "音频";

    // 格式化时间戳为 MM:SS 格式
    const formatTime = (ms: number): string => {
      const totalSeconds = Math.floor(ms / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    };

    // 构建 Markdown 内容
    const lines: string[] = [];
    lines.push(`# ${title}`);
    lines.push("");
    lines.push(`> ${mediaType}转录 | 语言: ${language}`);
    lines.push("");
    lines.push("## 转录内容");
    lines.push("");

    for (const segment of segments) {
      // 使用项目已有的 :time 指令格式
      const timeDisplay = formatTime(segment.start);
      lines.push(
        `:time[start=${segment.start},end=${segment.end}]{${timeDisplay}}${segment.text}`,
      );
      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * 清理所有临时文件
   */
  async cleanup() {
    if (this.tempDir) {
      try {
        const files = await fs.readdir(this.tempDir);
        for (const file of files) {
          await fs.unlink(path.join(this.tempDir, file));
        }
        console.log("[MarkItDown] Cleaned up all temp files");
      } catch (e) {
        console.warn("[MarkItDown] Failed to cleanup:", e);
      }
    }
  }
}

// 导出单例
const markitdownModule = new MarkItDownModule();
export default markitdownModule;
