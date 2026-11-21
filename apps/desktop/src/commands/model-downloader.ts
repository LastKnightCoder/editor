import type { QwenHardwareReport } from "../../shared/local-transcription";
import { ensureModule } from "./module-init";
import { invoke, on, off } from "@/electron";

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

export interface ModelsResponse {
  success: boolean;
  data?: ModelInfo[];
  error?: string;
}

export interface DownloadProgress {
  modelName: string;
  type: "progress";
  percentage: number;
  message: string;
}

export interface DownloadResult {
  success: boolean;
  model_dir?: string;
  error?: string;
}

// ==================== 模型下载 API ====================

/**
 * 获取所有模型信息（包含下载状态）
 */
export async function getModels(): Promise<ModelsResponse> {
  await ensureModule("model-downloader");
  return invoke("model-downloader-get-models");
}

export async function getQwenHardware(): Promise<QwenHardwareReport> {
  await ensureModule("model-downloader");
  return invoke("model-downloader-qwen-hardware");
}

/**
 * 下载模型
 */
export async function downloadModel(
  modelName: string,
  source: DownloadSource
): Promise<DownloadResult> {
  return invoke("model-downloader-download", modelName, source);
}

/**
 * 删除模型
 */
export async function deleteModel(
  modelName: string
): Promise<{ success: boolean; error?: string }> {
  return invoke("model-downloader-delete", modelName);
}

/**
 * 获取模型目录
 */
export async function getModelsDir(): Promise<string> {
  return invoke("model-downloader-get-dir");
}

/**
 * 监听下载进度
 */
export function onDownloadProgress(callback: (progress: DownloadProgress) => void): () => void {
  const handler = (_event: unknown, progress: DownloadProgress) => callback(progress);
  on("model-download-progress", handler);
  return () => off("model-download-progress", handler);
}

// ==================== 预编译程序相关类型 ====================

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

export interface ProgramsResponse {
  success: boolean;
  data?: ProgramInfo[];
  error?: string;
}

export interface ProgramDownloadProgress {
  programName: string;
  percentage: number;
  message: string;
  downloadedBytes: number;
  totalBytes: number;
}

// ==================== 预编译程序 API ====================

/**
 * 获取所有程序信息（包含下载状态，按平台过滤）
 */
export async function getPrograms(): Promise<ProgramsResponse> {
  return invoke("program-downloader-get-programs");
}

/**
 * 下载程序
 */
export async function downloadProgram(programName: string): Promise<DownloadResult> {
  return invoke("program-downloader-download", programName);
}

/**
 * 删除程序
 */
export async function deleteProgram(
  programName: string
): Promise<{ success: boolean; error?: string }> {
  return invoke("program-downloader-delete", programName);
}

/**
 * 监听程序下载进度
 */
export function onProgramDownloadProgress(
  callback: (progress: ProgramDownloadProgress) => void
): () => void {
  const handler = (_event: unknown, progress: ProgramDownloadProgress) => callback(progress);
  on("program-download-progress", handler);
  return () => off("program-download-progress", handler);
}
