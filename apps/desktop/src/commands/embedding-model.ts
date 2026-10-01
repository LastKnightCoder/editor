import { invoke, on, off } from "@/electron";
import { withModule } from "./module-init";

const invokeEmbedding = <T = any>(channel: string, ...args: any[]): Promise<T> =>
  withModule("embedding-model-manager", () => invoke<T>(channel, ...args));

export type EmbeddingDownloadSource = "modelscope" | "huggingface";
export type { EmbeddingProviderType } from "@/types/embedding";
export type EmbeddingDevicePolicy = "auto" | "cpu" | "cuda";

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

export interface EmbeddingModelsResponse {
  success: boolean;
  data?: EmbeddingModelInfo[];
  error?: string;
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

export async function getEmbeddingModels(): Promise<EmbeddingModelsResponse> {
  return invokeEmbedding("embedding-model-get-models");
}

export async function downloadEmbeddingModel(
  modelName: string,
  source: EmbeddingDownloadSource
): Promise<EmbeddingDownloadResult> {
  return invokeEmbedding("embedding-model-download", modelName, source);
}

export async function cancelEmbeddingDownload(modelName: string): Promise<{ success: boolean }> {
  return invokeEmbedding("embedding-model-cancel", modelName);
}

export async function deleteEmbeddingModel(
  modelName: string
): Promise<{ success: boolean; error?: string }> {
  return invokeEmbedding("embedding-model-delete", modelName);
}

export async function getEmbeddingModelsDir(): Promise<string> {
  return invokeEmbedding("embedding-model-get-dir");
}

export async function embeddingModelHealth(
  modelName: string,
  devicePolicy: EmbeddingDevicePolicy = "auto"
): Promise<{
  success: boolean;
  health?: {
    loaded: boolean;
    model_path?: string;
    model_name?: string;
    device?: string;
    dimensions?: number;
  };
  error?: string;
}> {
  return invokeEmbedding("embedding-model-health", modelName, devicePolicy);
}

export async function isEmbeddingModelDownloaded(modelName: string): Promise<boolean> {
  return invokeEmbedding("embedding-model-is-downloaded", modelName);
}

export async function getDownloadedEmbeddingModels(): Promise<string[]> {
  return invokeEmbedding("embedding-model-get-downloaded");
}

export async function isEmbeddingModelDownloading(modelName: string): Promise<boolean> {
  return invokeEmbedding("embedding-model-is-downloading", modelName);
}

export function onEmbeddingDownloadProgress(
  callback: (progress: EmbeddingDownloadProgress) => void
): () => void {
  const handler = (_event: unknown, progress: EmbeddingDownloadProgress) => callback(progress);
  on("embedding-model-download-progress", handler);
  return () => off("embedding-model-download-progress", handler);
}

/* ── 主内容向量索引状态（卡片 / 文章 / 项目文档 / 日记） ── */

export type EmbeddingIndexContentType = "card" | "article" | "project-item" | "diary-daily";

export interface EmbeddingIndexCounts {
  total: number;
  indexed: number;
  outdated: number;
  unindexed: number;
}

export interface EmbeddingIndexStats extends EmbeddingIndexCounts {
  byType: Record<EmbeddingIndexContentType, EmbeddingIndexCounts>;
}

export interface EmbeddingIndexProgress {
  mainDbName: string;
  reason: string;
  phase: "collecting" | "indexing" | "done" | "failed" | "aborted";
  queued: number;
  processed: number;
  indexed: number;
  failed: number;
  startedAt: number;
  finishedAt?: number;
  error?: string;
  /** 实时覆盖率（索引进行中由主进程逐篇更新） */
  stats?: EmbeddingIndexStats;
}

export interface EmbeddingIndexStatus {
  mainDbName: string;
  configValid: boolean;
  providerType: "local_python" | "remote_openai" | null;
  model: string | null;
  autoIndex: boolean;
  stats: EmbeddingIndexStats | null;
  running: EmbeddingIndexProgress | null;
  lastRun: EmbeddingIndexProgress | null;
  rebuildState: "pending" | "building" | "ready" | "failed" | null;
}

const invokeEmbeddingIndex = <T = any>(channel: string, ...args: any[]): Promise<T> =>
  withModule("embedding-index-orchestrator", () => invoke<T>(channel, ...args));

export async function getEmbeddingIndexStatus(): Promise<EmbeddingIndexStatus> {
  return invokeEmbeddingIndex("embedding-index-get-status");
}

export async function startEmbeddingIndex(): Promise<{ started: boolean; error?: string }> {
  return invokeEmbeddingIndex("embedding-index-start-manual");
}

export function onEmbeddingIndexProgress(
  callback: (progress: EmbeddingIndexProgress) => void
): () => void {
  const handler = (_event: unknown, progress: EmbeddingIndexProgress) => callback(progress);
  on("embedding-index-progress", handler);
  return () => off("embedding-index-progress", handler);
}
