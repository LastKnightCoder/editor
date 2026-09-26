/**
 * 音频转录服务模块
 *
 * 功能:
 * - 优先使用预编译的 faster-whisper 程序
 * - 如果没有预编译程序，使用 Python WebSocket 服务
 * - 支持词级/句级时间戳
 * - 进度回调
 * - 多种输出格式
 */

import { ipcMain, app, shell } from "electron";
import { spawn } from "child_process";
import path from "path";
import os from "os";
import fs from "fs-extra";
import { Module } from "../types/module";
import MediaUtil from "../utils/MediaUtil";
import { TranscriptionQueueManager } from "../utils/TranscriptionQueueManager";
import {
  applyLowConfidenceFallback,
  inferLanguageFromText,
  normalizeLanguageOption,
  parseLanguageFromLogs,
} from "../utils/transcription-language";

// ==================== 类型定义 ====================

export interface TranscriptionOptions {
  modelSize?: "tiny" | "base" | "small" | "medium" | "large-v1" | "large-v2" | "large-v3";
  language?: "auto" | string;
  device?: "cpu" | "cuda";
  computeType?: "int8" | "int16" | "float16" | "float32";
  wordTimestamps?: boolean;
  outputFormat?: "json" | "srt" | "vtt" | "text";
  modelDir?: string;
  // 句子级别断句参数（参考 VideoCaptioner）
  sentenceLevel?: boolean; // 是否使用句子级别断句，默认 true
  maxLineWidth?: number; // 每行最大宽度（中文默认30，英文默认90）
  maxLineCount?: number; // 每个字幕最大行数，默认1
  // LLM 优化断句
  useLLMOptimization?: boolean; // 是否使用 LLM 优化断句，开启后使用词级时间戳
}

export interface TranscriptionSegment {
  text: string;
  start: number; // 毫秒
  end: number; // 毫秒
}

export interface TranscriptionResult {
  text: string;
  language: string;
  languageProbability: number;
  duration: number;
  processingTime: number;
  segments: TranscriptionSegment[];
  wordSegments?: TranscriptionSegment[];
}

// ==================== 模型配置 ====================

export const AVAILABLE_MODELS = [
  {
    name: "faster-whisper-tiny",
    label: "Tiny",
    size: "75MB",
    description: "最快，准确度较低",
  },
  {
    name: "faster-whisper-base",
    label: "Base",
    size: "150MB",
    description: "推荐，平衡速度和准确度",
    recommended: true,
  },
  {
    name: "faster-whisper-small",
    label: "Small",
    size: "500MB",
    description: "更高准确度",
  },
  {
    name: "faster-whisper-medium",
    label: "Medium",
    size: "1.5GB",
    description: "专业级准确度",
  },
  {
    name: "faster-whisper-large-v1",
    label: "Large-v1",
    size: "3GB",
    description: "高准确度",
  },
  {
    name: "faster-whisper-large-v2",
    label: "Large-v2",
    size: "3GB",
    description: "更高准确度",
  },
  {
    name: "faster-whisper-large-v3",
    label: "Large-v3",
    size: "3GB",
    description: "最高准确度",
  },
];

// ==================== 转录服务类 ====================

class TranscriptionService {
  private modelsDir: string;
  private programsDir: string;

  constructor() {
    this.modelsDir = path.join(app.getPath("userData"), "models");
    this.programsDir = path.join(app.getPath("userData"), "bin");
  }

  // ==================== 预编译程序检测 ====================

  /**
   * macOS 随包分发的 whisper-cli（whisper.cpp）路径
   * 由 CI 构建并放入 extraResources，Metal 加速开箱即用
   */
  private async getBundledWhisperCliPath(): Promise<string | null> {
    if (process.platform !== "darwin") {
      return null;
    }

    const candidates = [
      // 打包后：extraResources/bin/whisper-cli
      path.join(process.resourcesPath, "bin", "whisper-cli"),
      // 开发环境：build/bin/darwin/whisper-cli（本地 make 产物）
      path.join(__dirname, "..", "..", "build", "bin", "darwin", "whisper-cli"),
    ];

    for (const candidate of candidates) {
      if (await fs.pathExists(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  /**
   * 构建 whisper.cpp (whisper-cli) 的命令参数
   * 输出 SRT 到临时目录，复用现有 SRT 解析逻辑
   */
  private buildWhisperCliArgs(
    modelPath: string,
    audioPath: string,
    outputDir: string,
    options: TranscriptionOptions
  ): string[] {
    const normalizedLanguage = normalizeLanguageOption(options.language);
    const language = normalizedLanguage.language;
    const useLLMOptimization = options.useLLMOptimization ?? false;
    const sentenceLevel = useLLMOptimization ? false : options.sentenceLevel !== false;

    const args = ["-m", modelPath, "-f", audioPath, "-osrt", "-of", outputDir, "-pp"];

    // whisper.cpp 不传 -l 时默认按英语识别（不同于 faster-whisper），自动模式须显式传 auto
    args.push("-l", language ?? "auto");

    if (sentenceLevel) {
      // 句子级断句：限制行宽
      const languageForLayout = language || "zh";
      const isAsianLanguage = ["zh", "ja", "ko"].includes(languageForLayout);
      const maxLineWidth = options.maxLineWidth ?? (isAsianLanguage ? 50 : 100);
      args.push("--max-len", String(maxLineWidth));
    } else {
      // 词级时间戳：token 级 DTW 对齐
      args.push("--max-len", "1", "--dtw");
    }

    return args;
  }

  /**
   * 获取预编译程序路径和设备类型（优先 GPU 版本）
   */
  private async getPrecompiledProgramInfo(): Promise<{
    path: string;
    device: "cuda" | "cpu";
  } | null> {
    // macOS：随包分发的 whisper.cpp（Metal 加速）
    const bundledWhisperCli = await this.getBundledWhisperCliPath();
    if (bundledWhisperCli) {
      return { path: bundledWhisperCli, device: "cpu" };
    }

    // Windows GPU 版本 (faster-whisper-xxl)
    const gpuPath = path.join(this.programsDir, "Faster-Whisper-XXL", "faster-whisper-xxl.exe");
    if (await fs.pathExists(gpuPath)) {
      return { path: gpuPath, device: "cuda" };
    }

    // Windows CPU 版本
    const cpuPath = path.join(this.programsDir, "faster-whisper.exe");
    if (await fs.pathExists(cpuPath)) {
      return { path: cpuPath, device: "cpu" };
    }

    return null;
  }

  /**
   * 获取预编译程序路径（向后兼容）
   */
  private async getPrecompiledProgramPath(): Promise<string | null> {
    const info = await this.getPrecompiledProgramInfo();
    return info?.path || null;
  }

  /**
   * 检查是否有可用的预编译程序
   */
  async hasPrecompiledProgram(): Promise<boolean> {
    return (await this.getPrecompiledProgramPath()) !== null;
  }

  /**
   * 获取可用的设备类型（基于已安装的程序）
   */
  async getAvailableDevices(): Promise<Array<"cuda" | "cpu">> {
    const devices: Array<"cuda" | "cpu"> = [];

    const gpuPath = path.join(this.programsDir, "Faster-Whisper-XXL", "faster-whisper-xxl.exe");
    if (await fs.pathExists(gpuPath)) {
      devices.push("cuda");
      devices.push("cpu"); // GPU 版也支持 CPU
    }

    const cpuPath = path.join(this.programsDir, "faster-whisper.exe");
    if (await fs.pathExists(cpuPath)) {
      if (!devices.includes("cpu")) {
        devices.push("cpu");
      }
    }

    return devices;
  }

  // ==================== 命令构建 ====================

  /**
   * 构建预编译程序的命令参数
   * 参考 VideoCaptioner 的 faster_whisper.py
   */
  private buildPrecompiledArgs(audioPath: string, options: TranscriptionOptions): string[] {
    const normalizedLanguage = normalizeLanguageOption(options.language);
    const language = normalizedLanguage.language;
    const useLLMOptimization = options.useLLMOptimization ?? false;
    // 如果启用 LLM 优化，则使用词级时间戳；否则使用句子级别
    const sentenceLevel = useLLMOptimization ? false : options.sentenceLevel !== false;

    // 根据语言设置默认行宽
    // 中文每行约 50 个字符，英文约 100 个字符
    const languageForLayout = language || "zh";
    const isAsianLanguage = ["zh", "ja", "ko"].includes(languageForLayout);
    const maxLineWidth = options.maxLineWidth ?? (isAsianLanguage ? 50 : 100);
    const maxLineCount = options.maxLineCount ?? 2;

    const args = [
      "-m",
      options.modelSize || "base",
      "-d",
      options.device || "cuda",
      "--output_format",
      "srt",
      "-o",
      "source", // 输出到源文件目录
      "--vad_filter",
      "true",
      "--print_progress",
      "--beep_off",
    ];

    // 自动模式下不传 -l，交给模型自动识别语言
    if (language) {
      args.push("-l", language);
    }

    // 句子级别断句参数（参考 VideoCaptioner）
    if (sentenceLevel) {
      // 禁用单词级别时间戳，使用句子级别
      args.push("--one_word", "0");
      // 启用句子模式
      args.push("--sentence");
      args.push("--max_line_width", String(maxLineWidth));
      args.push("--max_line_count", String(maxLineCount));
      // VideoCaptioner 的默认值
      args.push("--max_comma", "20");
      args.push("--max_comma_cent", "50");
    } else {
      // 启用单词级别时间戳（用于 LLM 优化或用户明确请求）
      args.push("--one_word", "1");
    }

    // 添加模型目录
    if (this.modelsDir) {
      args.push("--model_dir", this.modelsDir);
    }

    // 添加音频文件路径
    args.push(audioPath);

    return args;
  }

  // ==================== 转录方法 ====================

  /**
   * 使用预编译程序转录
   */
  private async transcribeWithPrecompiled(
    programPath: string,
    audioPath: string,
    options: TranscriptionOptions,
    onProgress?: (message: string) => void
  ): Promise<TranscriptionResult> {
    const normalizedLanguage = normalizeLanguageOption(options.language);
    const requestedLanguage = normalizedLanguage.language;
    const isAutoLanguage = normalizedLanguage.isAuto;
    const args = this.buildPrecompiledArgs(audioPath, options);
    const useLLMOptimization = options.useLLMOptimization ?? false;
    const sentenceLevel = useLLMOptimization ? false : options.sentenceLevel !== false;

    console.log("[Transcription] Using precompiled program:", programPath);
    console.log("[Transcription] Args:", args.join(" "));
    console.log(
      "[Transcription] Sentence level:",
      sentenceLevel,
      "LLM optimization:",
      useLLMOptimization
    );

    return new Promise((resolve, reject) => {
      let lastReportedProgress = -1;
      let stdout = "";
      let stderr = "";

      // Helper to process progress data - handles \r (carriage return) splitting
      const processProgressData = (data: string) => {
        // Split by carriage return or newline to handle terminal-style progress
        const lines = data.split(/\r|\n/).filter(line => line.trim());
        // Process only the last line (most recent progress)
        const lastLine = lines[lines.length - 1];
        if (lastLine) {
          const match = lastLine.match(/(\d+)%/);
          if (match) {
            const progress = parseInt(match[1]);
            if (progress !== lastReportedProgress) {
              lastReportedProgress = progress;
              if (onProgress) {
                onProgress(`正在转录 ... ${progress}%`);
              }
            }
          }
        }
      };

      const child = spawn(programPath, args, {
        windowsHide: true,
        cwd: path.dirname(audioPath),
        // 添加环境变量确保 UTF-8 编码
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          LANG: "en_US.UTF-8",
          LC_ALL: "en_US.UTF-8",
        },
      });

      // 使用 setEncoding 确保正确的编码
      child.stdout.setEncoding("utf-8");
      child.stderr.setEncoding("utf-8");

      child.stdout.on("data", (data: string) => {
        stdout += data;
        processProgressData(data);
        console.log("[Transcription stdout]:", data.trim());
      });

      child.stderr.on("data", (data: string) => {
        const message = data.trim();
        stderr += message + "\n";
        processProgressData(data);
        console.log("[Transcription stderr]:", message);
      });

      child.on("close", async code => {
        try {
          // 预编译程序输出 SRT 文件，需要解析
          const srtPath = audioPath.replace(/\.[^.]+$/, ".srt");

          // 先检查 SRT 文件是否存在
          // 即使进程返回非零退出码，如果 SRT 文件存在，也认为转录成功
          // 这是因为某些预编译程序在完成工作后可能会崩溃，但输出文件是正常的
          if (await fs.pathExists(srtPath)) {
            if (code !== 0) {
              console.log(
                `[Transcription] Warning: Process exited with code ${code}, but SRT file exists. Continuing...`
              );
            }

            const srtContent = await fs.readFile(srtPath, "utf-8");
            // 传递 sentenceLevel 标志以正确解析
            const result = this.parseSrtToResult(srtContent, sentenceLevel);
            const parsedLanguage = parseLanguageFromLogs(`${stdout}\n${stderr}`);

            // 清理临时 SRT 文件
            await fs.unlink(srtPath).catch(() => {
              console.warn(`[Transcription] Failed to delete SRT file: ${srtPath}`);
            });

            if (isAutoLanguage) {
              const detectedLanguage =
                parsedLanguage?.language || inferLanguageFromText(result.text);
              const detectedProbability =
                parsedLanguage?.probability === undefined ? 1 : parsedLanguage.probability;
              const finalLanguage = applyLowConfidenceFallback(
                detectedLanguage,
                detectedProbability
              );
              result.language = finalLanguage.language;
              result.languageProbability = finalLanguage.languageProbability;
            } else {
              result.language = requestedLanguage || "zh";
              result.languageProbability = 1;
            }

            resolve(result);
            return;
          }

          // SRT 文件不存在，且进程返回错误码
          if (code !== 0) {
            reject(new Error(`Transcription process exited with code ${code}: ${stderr}`));
            return;
          }

          // SRT 文件不存在，但进程返回成功码（不应该发生）
          reject(new Error(`SRT output file not found: ${srtPath}`));
        } catch (error) {
          reject(new Error(`Failed to parse SRT output: ${error}`));
        }
      });

      child.on("error", error => {
        reject(new Error(`Failed to start transcription process: ${error.message}`));
      });
    });
  }

  /**
   * 解析 SRT 内容为转录结果
   * @param srtContent SRT 文件内容
   * @param sentenceLevel 是否为句子级别（true = 句子级，false = 词级）
   */
  private parseSrtToResult(srtContent: string, sentenceLevel = true): TranscriptionResult {
    const parsedSegments: TranscriptionSegment[] = [];
    const lines = srtContent.split("\n");
    let i = 0;

    while (i < lines.length) {
      // 跳过空行和序号行
      if (!lines[i]?.trim() || /^\d+$/.test(lines[i].trim())) {
        i++;
        continue;
      }

      // 解析时间戳行
      const timeMatch = lines[i].match(
        /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/
      );

      if (timeMatch) {
        const startMs =
          parseInt(timeMatch[1]) * 3600000 +
          parseInt(timeMatch[2]) * 60000 +
          parseInt(timeMatch[3]) * 1000 +
          parseInt(timeMatch[4]);
        const endMs =
          parseInt(timeMatch[5]) * 3600000 +
          parseInt(timeMatch[6]) * 60000 +
          parseInt(timeMatch[7]) * 1000 +
          parseInt(timeMatch[8]);

        i++;

        // 收集文本行
        let text = "";
        while (i < lines.length && lines[i]?.trim() && !/^\d+$/.test(lines[i].trim())) {
          const line = lines[i].trim();
          // 检查是否是时间戳行
          if (line.match(/\d{2}:\d{2}:\d{2}[,.]?\d{0,3}\s*-->/)) {
            break;
          }
          text += (text ? " " : "") + line;
          i++;
        }

        if (text) {
          parsedSegments.push({ text, start: startMs, end: endMs });
        }
      } else {
        i++;
      }
    }

    const fullText = parsedSegments.map(s => s.text).join(" ");
    const duration =
      parsedSegments.length > 0 ? parsedSegments[parsedSegments.length - 1].end / 1000 : 0;

    // 根据模式决定返回格式
    if (sentenceLevel) {
      // 句子级别：直接返回解析的 segments
      return {
        text: fullText,
        language: "zh", // 默认
        languageProbability: 1.0,
        duration,
        processingTime: 0,
        segments: parsedSegments,
      };
    } else {
      // 词级别：把解析的 segments 作为 wordSegments 返回
      // segments 字段暂时为空（将由前端 LLM 优化填充）
      console.log(
        `[Transcription] Parsed ${parsedSegments.length} word segments for LLM optimization`
      );
      return {
        text: fullText,
        language: "zh", // 默认
        languageProbability: 1.0,
        duration,
        processingTime: 0,
        segments: [], // 词级模式下，句子级 segments 为空
        wordSegments: parsedSegments, // 词级时间戳
      };
    }
  }

  /**
   * 使用 macOS 随包 whisper-cli（whisper.cpp）转录
   * 输出 SRT 到临时目录，复用 SRT 解析逻辑
   */
  private async transcribeWithWhisperCli(
    programPath: string,
    audioPath: string,
    options: TranscriptionOptions,
    onProgress?: (message: string) => void
  ): Promise<TranscriptionResult> {
    const modelSize = options.modelSize || "base";
    const modelPath = path.join(
      this.modelsDir,
      `whisper-cpp-${modelSize}`,
      `ggml-${modelSize}.bin`
    );
    if (!(await fs.pathExists(modelPath))) {
      throw new Error(
        `未找到 whisper.cpp 模型（${modelPath}），请先在「设置 → 转录」中下载 whisper-cpp-${modelSize} 模型`
      );
    }

    const normalizedLanguage = normalizeLanguageOption(options.language);
    const requestedLanguage = normalizedLanguage.language;
    const isAutoLanguage = normalizedLanguage.isAuto;
    const useLLMOptimization = options.useLLMOptimization ?? false;
    const sentenceLevel = useLLMOptimization ? false : options.sentenceLevel !== false;

    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "tau-whisper-"));
    const args = this.buildWhisperCliArgs(modelPath, audioPath, outputDir, options);

    console.log("[Transcription] Using bundled whisper-cli:", programPath);
    console.log("[Transcription] Args:", args.join(" "));

    try {
      let stdout = "";
      let stderr = "";

      await new Promise<void>((resolve, reject) => {
        let lastReportedProgress = -1;
        const child = spawn(programPath, args, { windowsHide: true });
        child.stdout.setEncoding("utf-8");
        child.stderr.setEncoding("utf-8");

        const processProgressData = (data: string) => {
          const lines = data.split(/\r|\n/).filter(line => line.trim());
          const lastLine = lines[lines.length - 1];
          if (lastLine) {
            const match = lastLine.match(/(\d+)%/);
            if (match) {
              const progress = parseInt(match[1]);
              if (progress !== lastReportedProgress) {
                lastReportedProgress = progress;
                onProgress?.(`正在转录 ... ${progress}%`);
              }
            }
          }
        };

        child.stdout.on("data", (data: string) => {
          stdout += data;
          processProgressData(data);
        });
        child.stderr.on("data", (data: string) => {
          stderr += data + "\n";
          processProgressData(data);
        });
        child.on("error", reject);
        child.on("close", code => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`whisper-cli exited with code ${code}: ${stderr.slice(-2000)}`));
          }
        });
      });

      const srtPath = path.join(
        outputDir,
        `${path.basename(audioPath).replace(/\.[^.]+$/, "")}.srt`
      );
      if (!(await fs.pathExists(srtPath))) {
        throw new Error(`whisper-cli 未生成 SRT 输出: ${stderr.slice(-2000)}`);
      }

      const srtContent = await fs.readFile(srtPath, "utf-8");
      const result = this.parseSrtToResult(srtContent, sentenceLevel);

      if (isAutoLanguage) {
        const parsedLanguage = parseLanguageFromLogs(`${stdout}\n${stderr}`);
        const detectedLanguage = parsedLanguage?.language || inferLanguageFromText(result.text);
        const detectedProbability =
          parsedLanguage?.probability === undefined ? 1 : parsedLanguage.probability;
        const finalLanguage = applyLowConfidenceFallback(detectedLanguage, detectedProbability);
        result.language = finalLanguage.language;
        result.languageProbability = finalLanguage.languageProbability;
      } else {
        result.language = requestedLanguage || "zh";
        result.languageProbability = 1;
      }

      return result;
    } finally {
      await fs.remove(outputDir).catch(() => undefined);
    }
  }

  /**
   * 转录音频文件
   */
  async transcribe(
    audioPath: string,
    options: TranscriptionOptions = {},
    onProgress?: (message: string) => void
  ): Promise<TranscriptionResult> {
    // 验证文件存在
    if (!(await fs.pathExists(audioPath))) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    // 优先使用预编译程序
    const programInfo = await this.getPrecompiledProgramInfo();

    if (programInfo) {
      console.log(`[Transcription] Using precompiled program with device: ${programInfo.device}`);

      // macOS 随包 whisper-cli：参数体系不同，走专用路径
      if (process.platform === "darwin") {
        return this.transcribeWithWhisperCli(programInfo.path, audioPath, options, onProgress);
      }

      // 使用检测到的设备，覆盖 options 中的 device
      const optionsWithDevice = { ...options, device: programInfo.device };
      return this.transcribeWithPrecompiled(
        programInfo.path,
        audioPath,
        optionsWithDevice,
        onProgress
      );
    }

    // 无可用转录引擎：引导用户下载预编译程序
    throw new Error(
      "未找到可用的转录程序，请先在「设置 → 转录」中下载转录程序（Windows: faster-whisper，macOS: 应用内置 whisper-cli）"
    );
  }

  /**
   * 检查模型是否已下载
   */
  async isModelDownloaded(modelName: string): Promise<boolean> {
    const modelPath = path.join(this.modelsDir, modelName, "model.bin");
    return fs.pathExists(modelPath);
  }

  /**
   * 获取已下载的模型列表
   */
  async getDownloadedModels(): Promise<string[]> {
    const downloaded: string[] = [];

    if (!(await fs.pathExists(this.modelsDir))) {
      return downloaded;
    }

    for (const model of AVAILABLE_MODELS) {
      if (await this.isModelDownloaded(model.name)) {
        downloaded.push(model.name);
      }
    }

    return downloaded;
  }

  /**
   * 获取模型目录
   */
  getModelsDir(): string {
    return this.modelsDir;
  }

  /**
   * 打开模型目录
   */
  async openModelsDir(): Promise<void> {
    await fs.ensureDir(this.modelsDir);
    shell.openPath(this.modelsDir);
  }
}

// ==================== 模块定义 ====================

/** 共享转录服务实例（markitdown 等模块复用） */
export const transcriptionService = new TranscriptionService();

class TranscriptionModule implements Module {
  name: string;
  private service: TranscriptionService;
  private queueManager: TranscriptionQueueManager;

  constructor() {
    this.name = "transcription";
    this.service = transcriptionService;
    this.queueManager = new TranscriptionQueueManager();
  }

  async init() {
    // 转录音频
    ipcMain.handle(
      "transcribe-audio",
      async (event, audioPath: string, options: TranscriptionOptions) => {
        try {
          const result = await this.service.transcribe(audioPath, options, message => {
            // 发送进度到渲染进程
            event.sender.send("transcription-progress", { message });
          });
          return { success: true, data: result };
        } catch (error) {
          console.error("[Transcription] Error:", error);
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
    );

    // 获取可用模型列表
    ipcMain.handle("transcription-get-models", async () => {
      const downloadedModels = await this.service.getDownloadedModels();
      return AVAILABLE_MODELS.map(model => ({
        ...model,
        downloaded: downloadedModels.includes(model.name),
      }));
    });

    // 检查模型是否已下载
    ipcMain.handle("transcription-check-model", async (_event, modelName: string) => {
      return this.service.isModelDownloaded(modelName);
    });

    // 获取已下载的模型
    ipcMain.handle("transcription-get-downloaded-models", async () => {
      return this.service.getDownloadedModels();
    });

    // 获取模型目录
    ipcMain.handle("transcription-get-models-dir", () => {
      return this.service.getModelsDir();
    });

    // 打开模型目录
    ipcMain.handle("transcription-open-models-dir", async () => {
      await this.service.openModelsDir();
    });

    // 从视频中提取音频
    ipcMain.handle("transcription-extract-audio-from-video", async (event, videoPath: string) => {
      try {
        // 验证视频文件存在
        if (!(await fs.pathExists(videoPath))) {
          return {
            success: false,
            error: `Video file not found: ${videoPath}`,
          };
        }

        // 生成临时音频文件路径
        const outputPath = path.join(app.getPath("temp"), `audio-${Date.now()}.mp3`);

        // 提取音频
        await MediaUtil.extractAudioFromVideo(videoPath, outputPath, progress => {
          event.sender.send("transcription-extract-audio-progress", {
            progress,
          });
        });

        return { success: true, audioPath: outputPath };
      } catch (error) {
        console.error("[Transcription] Extract audio error:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // 获取音频时长
    ipcMain.handle("transcription-get-audio-duration", async (_event, audioPath: string) => {
      try {
        const duration = await MediaUtil.getMediaDuration(audioPath);
        return { success: true, duration };
      } catch (error) {
        console.error("[Transcription] Get duration error:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // 检查是否需要分段转录
    ipcMain.handle("transcription-should-segment", async (_event, audioPath: string) => {
      try {
        const result = await this.queueManager.shouldSegmentAudio(audioPath);
        return { success: true, ...result };
      } catch (error) {
        console.error("[Transcription] Check segment error:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // 分段转录音频
    ipcMain.handle(
      "transcription-transcribe-segmented",
      async (event, audioPath: string, options: TranscriptionOptions) => {
        try {
          // 获取音频时长
          const { shouldSegment, duration } = await this.queueManager.shouldSegmentAudio(audioPath);

          if (!shouldSegment) {
            // 不需要分段，直接转录
            const result = await this.service.transcribe(audioPath, options, message => {
              event.sender.send("transcription-progress", { message });
            });
            return { success: true, data: result };
          }

          // 创建分段
          const segments = await this.queueManager.createSegments(audioPath, duration);

          // 处理队列
          const result = await this.queueManager.processQueue(
            audioPath,
            segments,
            options,
            async (segmentAudioPath, segmentOptions) => {
              return this.service.transcribe(
                segmentAudioPath,
                segmentOptions,
                // 分段转录时不发送单独的进度
                // eslint-disable-next-line @typescript-eslint/no-empty-function
                () => {}
              );
            },
            message => {
              event.sender.send("transcription-progress", { message });
            }
          );

          return { success: true, data: result };
        } catch (error) {
          console.error("[Transcription] Segmented transcribe error:", error);
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
    );
  }

  getModelsDir(): string {
    return this.service.getModelsDir();
  }

  /**
   * 从视频中提取音频（供其他模块直接调用）
   */
  async extractAudioFromVideo(
    videoPath: string
  ): Promise<{ success: boolean; audioPath?: string; error?: string }> {
    try {
      const timestamp = Date.now();
      const outputPath = path.join(app.getPath("temp"), `audio-extract-${timestamp}.wav`);

      await MediaUtil.extractAudioFromVideo(videoPath, outputPath);

      return { success: true, audioPath: outputPath };
    } catch (error) {
      console.error("[Transcription] Extract audio error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 转录音频（供其他模块直接调用）
   */
  async transcribeAudio(
    audioPath: string,
    options: TranscriptionOptions = {},
    onProgress?: (message: string) => void
  ): Promise<{
    success: boolean;
    data?: TranscriptionResult;
    error?: string;
  }> {
    try {
      const result = await this.service.transcribe(audioPath, options, onProgress || (() => {}));
      return { success: true, data: result };
    } catch (error) {
      console.error("[Transcription] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export default new TranscriptionModule();
