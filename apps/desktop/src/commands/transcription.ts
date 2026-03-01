import { invoke, on, off } from "@/electron";

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
  languageProbability: number;
  duration: number;
  processingTime: number;
  segments: TranscriptionSegment[];
  wordSegments?: TranscriptionSegment[];
}

export interface TranscriptionResponse {
  success: boolean;
  data?: TranscriptionResult;
  error?: string;
}

export interface ModelInfo {
  name: string;
  label: string;
  size: string;
  description: string;
  recommended?: boolean;
  downloaded: boolean;
}

export interface ModelsResponse {
  success: boolean;
  data?: ModelInfo[];
  error?: string;
}

// ==================== 转录 API ====================

/**
 * 转录音频文件
 */
export async function transcribeAudio(
  audioPath: string,
  options: TranscriptionOptions = {},
): Promise<TranscriptionResponse> {
  return invoke("transcribe-audio", audioPath, options);
}

/**
 * 监听转录进度
 */
export function onTranscriptionProgress(
  callback: (data: { message: string }) => void,
): () => void {
  const handler = (_event: unknown, data: { message: string }) =>
    callback(data);
  on("transcription-progress", handler);
  return () => off("transcription-progress", handler);
}

/**
 * 获取可用模型列表
 */
export async function getTranscriptionModels(): Promise<ModelsResponse> {
  return invoke("transcription-get-models");
}

/**
 * 检查模型是否已下载
 */
export async function checkTranscriptionModel(
  modelName: string,
): Promise<boolean> {
  return invoke("transcription-check-model", modelName);
}

/**
 * 获取已下载的模型列表
 */
export async function getDownloadedTranscriptionModels(): Promise<string[]> {
  return invoke("transcription-get-downloaded-models");
}

/**
 * 获取模型目录
 */
export async function getTranscriptionModelsDir(): Promise<string> {
  return invoke("transcription-get-models-dir");
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
  videoPath: string,
): Promise<{ success: boolean; audioPath?: string; error?: string }> {
  return invoke("transcription-extract-audio-from-video", videoPath);
}

/**
 * 获取音频时长
 */
export async function getAudioDuration(
  audioPath: string,
): Promise<{ success: boolean; duration?: number; error?: string }> {
  return invoke("transcription-get-audio-duration", audioPath);
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
): Promise<TranscriptionResponse> {
  return invoke("transcription-transcribe-segmented", audioPath, options);
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

/**
 * 创建转录记录
 */
export async function createTranscription(
  data: ICreateTranscription,
): Promise<ITranscription> {
  return invoke("transcription:create", data);
}

/**
 * 根据 ID 获取转录记录
 */
export async function getTranscriptionById(
  id: number,
): Promise<ITranscription | null> {
  return invoke("transcription:get-by-id", id);
}

/**
 * 根据源文件路径获取转录记录
 */
export async function getTranscriptionBySource(
  sourcePath: string,
): Promise<ITranscription | null> {
  return invoke("transcription:get-by-source", sourcePath);
}

/**
 * 更新转录记录
 */
export async function updateTranscription(
  id: number,
  data: IUpdateTranscription,
): Promise<ITranscription | null> {
  return invoke("transcription:update", id, data);
}

/**
 * 删除转录记录
 */
export async function deleteTranscription(id: number): Promise<number> {
  return invoke("transcription:delete", id);
}

/**
 * 获取所有转录记录
 */
export async function getAllTranscriptions(options?: {
  sourceType?: "audio" | "video";
  language?: string;
  limit?: number;
  offset?: number;
}): Promise<ITranscription[]> {
  return invoke("transcription:get-all", options);
}

/**
 * 增加转录记录引用计数
 */
export async function incrementTranscriptionRefCount(
  id: number,
): Promise<void> {
  return invoke("transcription:increment-ref-count", id);
}
