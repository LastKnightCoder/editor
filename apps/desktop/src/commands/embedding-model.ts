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
