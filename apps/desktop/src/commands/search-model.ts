import { invoke, on, off } from "@/electron";
import { withModule } from "./module-init";
import type { EmbeddingDownloadSource } from "./embedding-model";

const invokeSearchModel = <T = any>(channel: string, ...args: any[]): Promise<T> =>
  withModule("embedding-model-manager", () => invoke<T>(channel, ...args));

export type SearchModelKind = "query_expander" | "reranker";

export interface SearchModelInfo {
  name: string;
  kind: SearchModelKind;
  label: string;
  description: string;
  size: string;
  recommended?: boolean;
  downloaded: boolean;
  modelscope: string;
  huggingface: string;
}

export interface SearchModelsResponse {
  success: boolean;
  data?: SearchModelInfo[];
  error?: string;
}

export interface SearchDownloadProgress {
  modelName: string;
  type: "progress";
  percentage: number;
  message: string;
  downloadedBytes?: number;
  totalBytes?: number;
  source?: EmbeddingDownloadSource;
}

export interface SearchDownloadResult {
  success: boolean;
  model_dir?: string;
  error?: string;
}

export async function getSearchModels(): Promise<SearchModelsResponse> {
  return invokeSearchModel("search-model-get-models");
}

export async function downloadSearchModel(
  modelName: string,
  source: EmbeddingDownloadSource
): Promise<SearchDownloadResult> {
  return invokeSearchModel("search-model-download", modelName, source);
}

export async function cancelSearchDownload(modelName: string): Promise<{ success: boolean }> {
  return invokeSearchModel("search-model-cancel", modelName);
}

export async function deleteSearchModel(
  modelName: string
): Promise<{ success: boolean; error?: string }> {
  return invokeSearchModel("search-model-delete", modelName);
}

export async function getSearchModelsDir(): Promise<string> {
  return invokeSearchModel("search-model-get-dir");
}

export async function isSearchModelDownloaded(modelName: string): Promise<boolean> {
  return invokeSearchModel("search-model-is-downloaded", modelName);
}

export async function getDownloadedSearchModels(): Promise<string[]> {
  return invokeSearchModel("search-model-get-downloaded");
}

export async function isSearchModelDownloading(modelName: string): Promise<boolean> {
  return invokeSearchModel("search-model-is-downloading", modelName);
}

export function onSearchDownloadProgress(
  callback: (progress: SearchDownloadProgress) => void
): () => void {
  const handler = (_event: unknown, progress: SearchDownloadProgress) => callback(progress);
  on("search-model-download-progress", handler);
  return () => off("search-model-download-progress", handler);
}
