import type { TranscriptionProgress } from "../../shared/media-progress";
import type { EngineOptions } from "../../shared/local-transcription";
import { invoke, on, off } from "@/electron";
import { ASRError, throwIfASRAborted, type ASRErrorCode } from "@tau/asr";
import { ensureModule } from "./module-init";
import { currentCommandScope } from "@/services/command-context";

// ==================== 类型定义 ====================

export interface TranscriptionOptions extends EngineOptions {
  modelSize?: "tiny" | "base" | "small" | "medium" | "large-v1" | "large-v2" | "large-v3";
  language?: "auto" | string;
  device?: "cpu" | "cuda";
  computeType?: "int8" | "int16" | "float16" | "float32";
  wordTimestamps?: boolean;
  outputFormat?: "json" | "srt" | "vtt" | "text";
  modelDir?: string;
  // 断句设置
  sentenceLevel?: boolean; // 是否使用句子级别断句
  useLLMOptimization?: boolean; // 是否使用 LLM 优化断句
}

export interface TranscriptionSegment {
  text: string;
  start: number; // 毫秒
  end: number; // 毫秒
}

export interface TranscriptionResult {
  text: string;
  language: string;
  languageProbability?: number;
  duration: number;
  processingTime: number;
  segments: TranscriptionSegment[];
  wordSegments?: TranscriptionSegment[];
}

export interface TranscriptionResponse {
  success: boolean;
  data?: TranscriptionResult;
  error?: string;
  errorCode: ASRErrorCode;
}

// ==================== 转录 API ====================

/**
 * 转录音频文件
 */
export interface TranscriptionRunOptions {
  signal?: AbortSignal;
  onProgress?: (data: TranscriptionProgress) => void;
}

async function runTranscription(
  channel: string,
  audioPath: string,
  options: TranscriptionOptions,
  run: TranscriptionRunOptions
) {
  const signals = [run.signal, currentCommandScope()?.signal].filter(
    (value): value is AbortSignal => Boolean(value)
  );
  const signal = signals.length ? AbortSignal.any(signals) : new AbortController().signal;
  throwIfASRAborted(signal);
  await ensureModule("transcription");
  throwIfASRAborted(signal);
  const taskId = crypto.randomUUID();
  const progress = (_event: unknown, data: TranscriptionProgress & { taskId: string }) => {
    if (!signal.aborted && data.taskId === taskId) {
      const { taskId: _taskId, ...progress } = data;
      void _taskId;
      run.onProgress?.(progress);
    }
  };
  const cancel = () => {
    void window.electron.invoke("transcription-cancel", taskId).catch(() => undefined);
  };
  on("transcription-progress", progress);
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const response = await invoke<TranscriptionResponse>(channel, audioPath, options, taskId);
    throwIfASRAborted(signal);
    if (response.errorCode === "cancelled")
      throw new ASRError("cancelled", response.error || "识别已取消");
    return response;
  } finally {
    signal.removeEventListener("abort", cancel);
    off("transcription-progress", progress);
  }
}

export function transcribeAudio(
  audioPath: string,
  options: TranscriptionOptions = {},
  run: TranscriptionRunOptions = {}
): Promise<TranscriptionResponse> {
  return runTranscription("transcribe-audio", audioPath, options, run);
}

/**
 * 打开模型目录
 */
export async function openTranscriptionModelsDir(): Promise<void> {
  return invoke("transcription-open-models-dir");
}

/**
 * 从视频中提取音频
 */
export async function extractAudioFromVideo(
  videoPath: string
): Promise<{ success: boolean; audioPath?: string; error?: string }> {
  return invoke("transcription-extract-audio-from-video", videoPath);
}

/**
 * 检查是否需要分段转录
 */
export async function shouldSegmentAudio(audioPath: string): Promise<{
  success: boolean;
  shouldSegment?: boolean;
  duration?: number;
  error?: string;
}> {
  return invoke("transcription-should-segment", audioPath);
}

/**
 * 分段转录音频（用于长视频）
 * 自动检测是否需要分段，如果需要则分段处理并合并结果
 */
export async function transcribeAudioSegmented(
  audioPath: string,
  options: TranscriptionOptions = {},
  run: TranscriptionRunOptions = {}
): Promise<TranscriptionResponse> {
  return runTranscription("transcription-transcribe-segmented", audioPath, options, run);
}

// ==================== 数据库 API ====================

export interface ITranscriptionSegment {
  text: string;
  start: number;
  end: number;
}

export interface ITranscription {
  id: number;
  sourceType: "audio" | "video";
  sourceId?: number;
  sourcePath: string;
  createTime: number;
  updateTime: number;
  text: string;
  language: string;
  languageProbability: number;
  duration: number;
  processingTime: number;
  modelSize: string;
  segments: ITranscriptionSegment[];
  wordSegments?: ITranscriptionSegment[];
  refCount: number;
}

export interface ICreateTranscription {
  sourceType: "audio" | "video";
  sourceId?: number;
  sourcePath: string;
  text: string;
  language: string;
  languageProbability: number;
  duration: number;
  processingTime: number;
  modelSize: string;
  segments: ITranscriptionSegment[];
  wordSegments?: ITranscriptionSegment[];
}

export interface IUpdateTranscription {
  text?: string;
  segments?: ITranscriptionSegment[];
  wordSegments?: ITranscriptionSegment[];
}
