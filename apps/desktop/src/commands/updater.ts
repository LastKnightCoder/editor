import { invoke, on, off } from "@/electron";

export interface ReleaseNote {
  version: string;
  /** Markdown 正文 */
  note: string;
}

export interface UpdateCheckResult {
  available: boolean;
  currentVersion: string;
  version: string | null;
  releaseDate: string | null;
  /** 更新包直链，应用内更新失败时可手动下载 */
  fallbackUrl: string | null;
  /** 新版本发布时附带的公告，可能含当前版本及更早的条目 */
  releaseNotes: ReleaseNote[];
}

export interface VersionChange {
  /** 上次启动的版本：null = 首次安装或未变化；"" = 从未记录版本的旧版升级而来 */
  previousVersion: string | null;
  currentVersion: string;
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

/** 取本次启动相对上次的版本变化，主进程只交付一次 */
export async function takeVersionChange(): Promise<VersionChange> {
  return invoke("updater:take-version-change");
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
