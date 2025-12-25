/**
 * 音频转录服务模块
 *
 * 功能:
 * - 优先使用预编译的 faster-whisper 程序
 * - 如果没有预编译程序，回退到 Python 子进程
 * - 支持词级/句级时间戳
 * - 进度回调
 * - 多种输出格式
 */

import { ipcMain, app, shell } from "electron";
import { spawn } from "child_process";
import path from "path";
import fs from "fs-extra";
import { Module } from "../types/module";
import MediaUtil from "../utils/MediaUtil";
import { TranscriptionQueueManager } from "../utils/TranscriptionQueueManager";

// ==================== 类型定义 ====================

export interface TranscriptionOptions {
  modelSize?:
    | "tiny"
    | "base"
    | "small"
    | "medium"
    | "large-v1"
    | "large-v2"
    | "large-v3";
  language?: string;
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

interface PythonOutput {
  text: string;
  language: string;
  language_probability: number;
  duration: number;
  processing_time: number;
  segments: TranscriptionSegment[];
  word_segments?: TranscriptionSegment[];
  error?: string;
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
   * 获取预编译程序路径和设备类型（优先 GPU 版本）
   */
  private async getPrecompiledProgramInfo(): Promise<{
    path: string;
    device: "cuda" | "cpu";
  } | null> {
    // GPU 版本 (faster-whisper-xxl)
    const gpuPath = path.join(
      this.programsDir,
      "Faster-Whisper-XXL",
      "faster-whisper-xxl.exe",
    );
    if (await fs.pathExists(gpuPath)) {
      return { path: gpuPath, device: "cuda" };
    }

    // CPU 版本
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

    const gpuPath = path.join(
      this.programsDir,
      "Faster-Whisper-XXL",
      "faster-whisper-xxl.exe",
    );
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

  // ==================== Python 回退方案 ====================

  /**
   * 获取 Python 可执行文件路径
   */
  private getTranscriberPath(): string {
    const isDev = !app.isPackaged;

    if (isDev) {
      // 开发环境：使用 uv
      return "uv";
    } else {
      // 生产环境：使用打包的可执行文件
      const ext = process.platform === "win32" ? ".exe" : "";
      return path.join(process.resourcesPath, "bin", `transcriber${ext}`);
    }
  }

  /**
   * 获取脚本目录
   */
  private getScriptsDir(): string {
    return path.join(__dirname, "..", "..", "src-python");
  }

  // ==================== 命令构建 ====================

  /**
   * 构建预编译程序的命令参数
   * 参考 VideoCaptioner 的 faster_whisper.py
   */
  private buildPrecompiledArgs(
    audioPath: string,
    options: TranscriptionOptions,
  ): string[] {
    const language = options.language || "zh";
    const useLLMOptimization = options.useLLMOptimization ?? false;
    // 如果启用 LLM 优化，则使用词级时间戳；否则使用句子级别
    const sentenceLevel = useLLMOptimization
      ? false
      : options.sentenceLevel !== false;

    // 根据语言设置默认行宽
    // 中文每行约 50 个字符，英文约 100 个字符
    const isAsianLanguage = ["zh", "ja", "ko"].includes(language);
    const maxLineWidth = options.maxLineWidth ?? (isAsianLanguage ? 50 : 100);
    const maxLineCount = options.maxLineCount ?? 2;

    const args = [
      "-m",
      options.modelSize || "base",
      "-l",
      language,
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

  /**
   * 构建 Python 转录命令参数
   */
  private buildPythonTranscriberArgs(
    audioPath: string,
    options: TranscriptionOptions,
  ): string[] {
    const isDev = !app.isPackaged;
    const useLLMOptimization = options.useLLMOptimization ?? false;
    const sentenceLevel = useLLMOptimization
      ? false
      : options.sentenceLevel !== false;

    const baseArgs = [
      audioPath,
      "--model",
      options.modelSize || "base",
      "--device",
      options.device || "cpu",
      "--compute-type",
      options.computeType || "int8",
      "--output-format",
      options.outputFormat || "json",
    ];

    if (options.language) {
      baseArgs.push("--language", options.language);
    }

    // Handle word timestamps based on settings
    // If LLM optimization is enabled OR sentence level is disabled (word level), enable word timestamps
    if (useLLMOptimization || !sentenceLevel) {
      baseArgs.push("--word-timestamps");
    }

    if (options.modelDir || this.modelsDir) {
      baseArgs.push("--model-dir", options.modelDir || this.modelsDir);
    }

    if (isDev) {
      // 开发环境：uv run python transcribe.py ...
      return [
        "run",
        "--directory",
        this.getScriptsDir(),
        "python",
        "transcribe.py",
        ...baseArgs,
      ];
    }

    return baseArgs;
  }

  // ==================== 转录方法 ====================

  /**
   * 使用预编译程序转录
   */
  private async transcribeWithPrecompiled(
    programPath: string,
    audioPath: string,
    options: TranscriptionOptions,
    onProgress?: (message: string) => void,
  ): Promise<TranscriptionResult> {
    const args = this.buildPrecompiledArgs(audioPath, options);
    const useLLMOptimization = options.useLLMOptimization ?? false;
    const sentenceLevel = useLLMOptimization
      ? false
      : options.sentenceLevel !== false;

    console.log("[Transcription] Using precompiled program:", programPath);
    console.log("[Transcription] Args:", args.join(" "));
    console.log(
      "[Transcription] Sentence level:",
      sentenceLevel,
      "LLM optimization:",
      useLLMOptimization,
    );

    return new Promise((resolve, reject) => {
      let lastReportedProgress = -1;

      // Helper to process progress data - handles \r (carriage return) splitting
      const processProgressData = (data: string) => {
        // Split by carriage return or newline to handle terminal-style progress
        const lines = data.split(/\r|\n/).filter((line) => line.trim());
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

      let stderr = "";

      // 使用 setEncoding 确保正确的编码
      child.stdout.setEncoding("utf-8");
      child.stderr.setEncoding("utf-8");

      child.stdout.on("data", (data: string) => {
        processProgressData(data);
        console.log("[Transcription stdout]:", data.trim());
      });

      child.stderr.on("data", (data: string) => {
        const message = data.trim();
        stderr += message + "\n";
        processProgressData(data);
        console.log("[Transcription stderr]:", message);
      });

      child.on("close", async (code) => {
        try {
          // 预编译程序输出 SRT 文件，需要解析
          const srtPath = audioPath.replace(/\.[^.]+$/, ".srt");

          // 先检查 SRT 文件是否存在
          // 即使进程返回非零退出码，如果 SRT 文件存在，也认为转录成功
          // 这是因为某些预编译程序在完成工作后可能会崩溃，但输出文件是正常的
          if (await fs.pathExists(srtPath)) {
            if (code !== 0) {
              console.log(
                `[Transcription] Warning: Process exited with code ${code}, but SRT file exists. Continuing...`,
              );
            }

            const srtContent = await fs.readFile(srtPath, "utf-8");
            // 传递 sentenceLevel 标志以正确解析
            const result = this.parseSrtToResult(srtContent, sentenceLevel);

            // 清理临时 SRT 文件
            await fs.unlink(srtPath).catch(() => {});

            resolve(result);
            return;
          }

          // SRT 文件不存在，且进程返回错误码
          if (code !== 0) {
            reject(
              new Error(
                `Transcription process exited with code ${code}: ${stderr}`,
              ),
            );
            return;
          }

          // SRT 文件不存在，但进程返回成功码（不应该发生）
          reject(new Error(`SRT output file not found: ${srtPath}`));
        } catch (error) {
          reject(new Error(`Failed to parse SRT output: ${error}`));
        }
      });

      child.on("error", (error) => {
        reject(
          new Error(`Failed to start transcription process: ${error.message}`),
        );
      });
    });
  }

  /**
   * 解析 SRT 内容为转录结果
   * @param srtContent SRT 文件内容
   * @param sentenceLevel 是否为句子级别（true = 句子级，false = 词级）
   */
  private parseSrtToResult(
    srtContent: string,
    sentenceLevel = true,
  ): TranscriptionResult {
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
        /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/,
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
        while (
          i < lines.length &&
          lines[i]?.trim() &&
          !/^\d+$/.test(lines[i].trim())
        ) {
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

    const fullText = parsedSegments.map((s) => s.text).join(" ");
    const duration =
      parsedSegments.length > 0
        ? parsedSegments[parsedSegments.length - 1].end / 1000
        : 0;

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
        `[Transcription] Parsed ${parsedSegments.length} word segments for LLM optimization`,
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
   * 使用 Python 转录（回退方案）
   */
  private async transcribeWithPython(
    audioPath: string,
    options: TranscriptionOptions,
    onProgress?: (message: string) => void,
  ): Promise<TranscriptionResult> {
    const execPath = this.getTranscriberPath();
    const args = this.buildPythonTranscriberArgs(audioPath, options);
    const useLLMOptimization = options.useLLMOptimization ?? false;
    const sentenceLevel = useLLMOptimization
      ? false
      : options.sentenceLevel !== false;

    console.log("[Transcription] Using Python:", execPath, args.join(" "));
    console.log(
      "[Transcription] Sentence level:",
      sentenceLevel,
      "LLM optimization:",
      useLLMOptimization,
    );
    console.log(
      "[Transcription] Word timestamps enabled:",
      !sentenceLevel || useLLMOptimization,
    );

    return new Promise((resolve, reject) => {
      let lastReportedProgress = -1;

      // Helper to process progress data - handles \r (carriage return) splitting
      const processProgressData = (data: string) => {
        // Split by carriage return or newline to handle terminal-style progress
        const lines = data.split(/\r|\n/).filter((line) => line.trim());
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

      const isDev = !app.isPackaged;
      const child = spawn(execPath, args, {
        windowsHide: true,
        // 开发环境需要 cwd 定位 Python 脚本，生产环境使用二进制文件不需要
        ...(isDev ? { cwd: this.getScriptsDir() } : {}),
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        const message = data.toString().trim();
        stderr += message + "\n";

        // Process progress updates
        processProgressData(data.toString());

        console.log("[Transcription]:", message);
      });

      child.on("close", (code) => {
        if (code !== 0) {
          // 尝试从 stdout 解析错误信息
          try {
            const errorResult = JSON.parse(stdout) as PythonOutput;
            if (errorResult.error) {
              reject(new Error(errorResult.error));
              return;
            }
          } catch {
            // stdout 不是有效 JSON，忽略
          }
          reject(
            new Error(
              `Transcription process exited with code ${code}: ${stderr}`,
            ),
          );
          return;
        }

        try {
          const result = JSON.parse(stdout) as PythonOutput;

          if (result.error) {
            reject(new Error(result.error));
            return;
          }

          // Python script doesn't have sentence-level optimization like precompiled
          // If word timestamps were requested, return them for LLM optimization
          if (useLLMOptimization && result.word_segments) {
            // Return word segments for LLM optimization, empty regular segments
            console.log(
              `[Transcription] Returning ${result.word_segments.length} word segments for LLM optimization`,
            );
            resolve({
              text: result.text,
              language: result.language,
              languageProbability: result.language_probability,
              duration: result.duration,
              processingTime: result.processing_time,
              segments: [], // Empty - will be filled by LLM optimization
              wordSegments: result.word_segments,
            });
          } else {
            // Regular sentence-level segments
            resolve({
              text: result.text,
              language: result.language,
              languageProbability: result.language_probability,
              duration: result.duration,
              processingTime: result.processing_time,
              segments: result.segments,
              wordSegments: result.word_segments,
            });
          }
        } catch (error) {
          reject(new Error(`Failed to parse output: ${stdout}`));
        }
      });

      child.on("error", (error) => {
        reject(
          new Error(`Failed to start transcription process: ${error.message}`),
        );
      });
    });
  }

  /**
   * 转录音频文件
   */
  async transcribe(
    audioPath: string,
    options: TranscriptionOptions = {},
    onProgress?: (message: string) => void,
  ): Promise<TranscriptionResult> {
    // 验证文件存在
    if (!(await fs.pathExists(audioPath))) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    // 优先使用预编译程序
    const programInfo = await this.getPrecompiledProgramInfo();

    if (programInfo) {
      console.log(
        `[Transcription] Using precompiled program with device: ${programInfo.device}`,
      );
      // 使用检测到的设备，覆盖 options 中的 device
      const optionsWithDevice = { ...options, device: programInfo.device };
      return this.transcribeWithPrecompiled(
        programInfo.path,
        audioPath,
        optionsWithDevice,
        onProgress,
      );
    }

    // 回退到 Python
    console.log("[Transcription] Falling back to Python");
    return this.transcribeWithPython(audioPath, options, onProgress);
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

class TranscriptionModule implements Module {
  name: string;
  private service: TranscriptionService;
  private queueManager: TranscriptionQueueManager;

  constructor() {
    this.name = "transcription";
    this.service = new TranscriptionService();
    this.queueManager = new TranscriptionQueueManager();
  }

  async init() {
    // 转录音频
    ipcMain.handle(
      "transcribe-audio",
      async (event, audioPath: string, options: TranscriptionOptions) => {
        try {
          const result = await this.service.transcribe(
            audioPath,
            options,
            (message) => {
              // 发送进度到渲染进程
              event.sender.send("transcription-progress", { message });
            },
          );
          return { success: true, data: result };
        } catch (error) {
          console.error("[Transcription] Error:", error);
          return {
            success: false,
            error:
              error instanceof Error ? error.message : "Transcription failed",
          };
        }
      },
    );

    // 获取可用模型列表
    ipcMain.handle("transcription-get-models", async () => {
      const downloadedModels = await this.service.getDownloadedModels();
      return AVAILABLE_MODELS.map((model) => ({
        ...model,
        downloaded: downloadedModels.includes(model.name),
      }));
    });

    // 检查模型是否已下载
    ipcMain.handle(
      "transcription-check-model",
      async (_event, modelName: string) => {
        return this.service.isModelDownloaded(modelName);
      },
    );

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
    ipcMain.handle(
      "transcription-extract-audio-from-video",
      async (event, videoPath: string) => {
        try {
          // 验证视频文件存在
          if (!(await fs.pathExists(videoPath))) {
            return {
              success: false,
              error: `Video file not found: ${videoPath}`,
            };
          }

          // 生成临时音频文件路径
          const outputPath = path.join(
            app.getPath("temp"),
            `audio-${Date.now()}.mp3`,
          );

          // 提取音频
          await MediaUtil.extractAudioFromVideo(
            videoPath,
            outputPath,
            (progress) => {
              event.sender.send("transcription-extract-audio-progress", {
                progress,
              });
            },
          );

          return { success: true, audioPath: outputPath };
        } catch (error) {
          console.error("[Transcription] Extract audio error:", error);
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to extract audio",
          };
        }
      },
    );

    // 获取音频时长
    ipcMain.handle(
      "transcription-get-audio-duration",
      async (_event, audioPath: string) => {
        try {
          const duration = await MediaUtil.getMediaDuration(audioPath);
          return { success: true, duration };
        } catch (error) {
          console.error("[Transcription] Get duration error:", error);
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to get audio duration",
          };
        }
      },
    );

    // 检查是否需要分段转录
    ipcMain.handle(
      "transcription-should-segment",
      async (_event, audioPath: string) => {
        try {
          const result = await this.queueManager.shouldSegmentAudio(audioPath);
          return { success: true, ...result };
        } catch (error) {
          console.error("[Transcription] Check segment error:", error);
          return {
            success: false,
            error:
              error instanceof Error ? error.message : "Failed to check audio",
          };
        }
      },
    );

    // 分段转录音频
    ipcMain.handle(
      "transcription-transcribe-segmented",
      async (event, audioPath: string, options: TranscriptionOptions) => {
        try {
          // 获取音频时长
          const { shouldSegment, duration } =
            await this.queueManager.shouldSegmentAudio(audioPath);

          if (!shouldSegment) {
            // 不需要分段，直接转录
            const result = await this.service.transcribe(
              audioPath,
              options,
              (message) => {
                event.sender.send("transcription-progress", { message });
              },
            );
            return { success: true, data: result };
          }

          // 创建分段
          const segments = await this.queueManager.createSegments(
            audioPath,
            duration,
          );

          // 处理队列
          const result = await this.queueManager.processQueue(
            audioPath,
            segments,
            options,
            async (segmentAudioPath, segmentOptions) => {
              return this.service.transcribe(
                segmentAudioPath,
                segmentOptions,
                () => {}, // 分段转录时不发送单独的进度
              );
            },
            (message) => {
              event.sender.send("transcription-progress", { message });
            },
          );

          return { success: true, data: result };
        } catch (error) {
          console.error("[Transcription] Segmented transcribe error:", error);
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Segmented transcription failed",
          };
        }
      },
    );
  }
}

export default new TranscriptionModule();
