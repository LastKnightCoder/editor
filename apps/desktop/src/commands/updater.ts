import { invoke, on, off } from "@/electron";

export interface UpdateCheckResult {
  available: boolean;
  currentVersion: string;
  version: string | null;
  releaseDate: string | null;
  /** 更新包直链，应用内更新失败时可手动下载 */
  fallbackUrl: string | null;
}

export interface UpdateDownloadProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  return invoke("updater:check");
}

export async function downloadUpdate(): Promise<{ started: boolean }> {
  return invoke("updater:download");
}

export async function installUpdate(): Promise<void> {
  return invoke("updater:install");
}

export function onUpdateDownloadProgress(
  callback: (progress: UpdateDownloadProgress) => void
): () => void {
  const handler = (_event: unknown, progress: UpdateDownloadProgress) => callback(progress);
  on("updater:download-progress", handler);
  return () => off("updater:download-progress", handler);
}

export function onUpdateDownloaded(callback: (payload: { version: string }) => void): () => void {
  const handler = (_event: unknown, payload: { version: string }) => callback(payload);
  on("updater:update-downloaded", handler);
  return () => off("updater:update-downloaded", handler);
}

export function onUpdateError(callback: (payload: { message: string }) => void): () => void {
  const handler = (_event: unknown, payload: { message: string }) => callback(payload);
  on("updater:error", handler);
  return () => off("updater:error", handler);
}

export function onInstallFailed(
  callback: (payload: { fallbackUrl: string | null }) => void
): () => void {
  const handler = (_event: unknown, payload: { fallbackUrl: string | null }) => callback(payload);
  on("updater:install-failed", handler);
  return () => off("updater:install-failed", handler);
}
