import { app, shell } from "electron";
import { ASRError, throwIfASRAborted, waitForASR } from "@tau/asr";
import { runASRProcess } from "./asr-process";
import FfmpegService from "../utils/FfmpegService";
import path from "path";
import os from "os";
import fs from "fs-extra";
import {
  applyLowConfidenceFallback,
  inferLanguageFromText,
  normalizeLanguageOption,
} from "../utils/transcription-language";
import { normalizeModelSize, whisperDtwPreset } from "../utils/transcription-model";

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

export class TranscriptionService {
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
      ...(process.resourcesPath ? [path.join(process.resourcesPath, "bin", "whisper-cli")] : []),
      // 开发环境：build/bin/darwin/whisper-cli（本地 make 产物）
      path.join(app.getAppPath(), "build", "bin", "darwin", "whisper-cli"),
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
    const useLLMOptimization = Boolean(options.useLLMOptimization || options.wordTimestamps);
    const sentenceLevel = useLLMOptimization ? false : options.sentenceLevel !== false;

    // -of 是输出文件路径（不含扩展名），不是目录：落到 outputDir/<音频名>.srt，与读取处一致
    const outputFile = path.join(outputDir, path.basename(audioPath).replace(/\.[^.]+$/, ""));
    const args = ["-m", modelPath, "-f", audioPath, "-osrt", "-of", outputFile, "-pp"];

    // whisper.cpp 不传 -l 时默认按英语识别（不同于 faster-whisper），自动模式须显式传 auto
    args.push("-l", language ?? "auto");

    if (sentenceLevel) {
      // 句子级断句：限制行宽
      const languageForLayout = language || "zh";
      const isAsianLanguage = ["zh", "ja", "ko"].includes(languageForLayout);
      const maxLineWidth = options.maxLineWidth ?? (isAsianLanguage ? 50 : 100);
      args.push("--max-len", String(maxLineWidth));
    } else {
      // 词级时间戳：每段一个 token；DTW 对齐需指定模型预设，未知尺寸时不开（退化为普通 token 时间戳）
      args.push("--max-len", "1");
      const dtwPreset = whisperDtwPreset(options.modelSize);
      if (dtwPreset) args.push("--dtw", dtwPreset);
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
    if (process.platform === "darwin") {
      return bundledWhisperCli ? { path: bundledWhisperCli, device: "cpu" } : null;
    }
    if (process.platform !== "win32") return null;

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
    const useLLMOptimization = Boolean(options.useLLMOptimization || options.wordTimestamps);
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
        while (i < lines.length && lines[i]?.trim()) {
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

  /** 文件任务始终先规范为 PCM WAV，输出与临时资源只属于本次调用。 */
  async transcribe(
    audioPath: string,
    options: TranscriptionOptions = {},
    onProgress?: (message: string) => void,
    signal = new AbortController().signal
  ): Promise<TranscriptionResult> {
    throwIfASRAborted(signal);
    const source = await fs.stat(audioPath);
    if (!source.isFile()) throw new ASRError("invalid-input", "音频来源必须是文件");
    const settings = {
      ...options,
      modelSize: normalizeModelSize(options.modelSize) as TranscriptionOptions["modelSize"],
    };
    const program = await this.getPrecompiledProgramInfo();
    throwIfASRAborted(signal);
    if (!program) throw new ASRError("needs-assets", "请先在设置中准备 Whisper 转录程序");
    const size = settings.modelSize || "base";
    const modelPath = path.join(this.modelsDir, `whisper-cpp-${size}`, `ggml-${size}.bin`);
    if (!(await this.isModelDownloaded(size))) {
      const prefix = process.platform === "darwin" ? "whisper-cpp" : "faster-whisper";
      throw new ASRError("needs-assets", `请先在设置中下载 ${prefix}-${size} 模型`);
    }
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "tau-whisper-"));
    const startedAt = Date.now();
    try {
      throwIfASRAborted(signal);
      onProgress?.("正在准备识别音频...");
      const ffmpeg = await waitForASR(FfmpegService.ensureFluentFfmpegPath(), signal);
      throwIfASRAborted(signal);
      const input = path.join(temporary, "input.wav");
      await runASRProcess(
        ffmpeg,
        [
          "-nostdin",
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          audioPath,
          "-map",
          "0:a:0",
          "-vn",
          "-ac",
          "1",
          "-ar",
          "16000",
          "-c:a",
          "pcm_s16le",
          "-y",
          input,
        ],
        signal
      );
      const args =
        process.platform === "darwin"
          ? this.buildWhisperCliArgs(modelPath, input, temporary, settings)
          : this.buildPrecompiledArgs(input, {
              ...settings,
              device: settings.device ?? program.device,
            });
      const { language: detected } = await runASRProcess(program.path, args, signal, onProgress);
      throwIfASRAborted(signal);
      const srt = await fs.readFile(path.join(temporary, "input.srt"), "utf8");
      const sentenceLevel =
        settings.useLLMOptimization || settings.wordTimestamps
          ? false
          : settings.sentenceLevel !== false;
      const result = this.parseSrtToResult(srt, sentenceLevel);
      const normalized = normalizeLanguageOption(settings.language);
      if (normalized.isAuto) {
        const inferred = applyLowConfidenceFallback(
          detected?.language || inferLanguageFromText(result.text),
          detected?.probability ?? 1
        );
        result.language = inferred.language;
        result.languageProbability = inferred.languageProbability;
      } else if (normalized.language) {
        result.language = normalized.language;
      }
      result.processingTime = (Date.now() - startedAt) / 1000;
      throwIfASRAborted(signal);
      return result;
    } finally {
      await fs.remove(temporary);
    }
  }

  /**
   * 检查模型是否已下载
   */
  async isModelDownloaded(modelName: string): Promise<boolean> {
    const size = normalizeModelSize(modelName);
    const modelPath =
      process.platform === "darwin"
        ? path.join(this.modelsDir, `whisper-cpp-${size}`, `ggml-${size}.bin`)
        : path.join(this.modelsDir, `faster-whisper-${size}`, "model.bin");
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
