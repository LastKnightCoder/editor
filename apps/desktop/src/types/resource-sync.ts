export enum ResourceSyncStatus {
  Pending = "pending",
  Syncing = "syncing",
  Synced = "synced",
  Error = "error",
}

export type ResourceFileType = "image" | "video" | "audio" | "pdf" | "attachment";

export interface IFileSyncStatus {
  syncStatus: ResourceSyncStatus;
  syncDirection: "upload" | "download" | null;
  fileSize: number | null;
  lastSyncTime: number | null;
  errorMessage: string | null;
  retryCount: number;
}

export interface ISyncStatusFile {
  provider: ResourceSyncProvider;
  config: Record<string, string>;
  lastSyncTime: number | null;
  files: Record<string, IFileSyncStatus>;
}

export interface IResourceSyncProgress {
  totalFiles: number;
  processedFiles: number;
  currentFile: string | null;
  status: "idle" | "scanning" | "syncing" | "completed" | "error" | "cancelled";
  uploadCount: number;
  downloadCount: number;
  skippedCount: number;
  errorCount: number;
  startTime: number | null;
}

export interface IRateLimitConfig {
  maxConcurrent: number;
  requestsPerSecond: number;
  retryCount: number;
  retryDelayMs: number;
  retryBackoffMultiplier: number;
}

export type ResourceSyncProvider = "plugin";

interface BaseResourceSyncOptions {
  provider: ResourceSyncProvider;
  rateLimit?: Partial<IRateLimitConfig>;
}

export type ResourceSyncOptions = BaseResourceSyncOptions & {
  provider: "plugin";
  pluginId: string;
  config: unknown;
};

export const RATE_LIMIT_CONFIGS: Record<string, IRateLimitConfig> = {
  plugin: {
    maxConcurrent: 5,
    requestsPerSecond: 50,
    retryCount: 3,
    retryDelayMs: 1000,
    retryBackoffMultiplier: 2,
  },
};

export interface IResourceSyncBlacklistItem {
  id: number;
  fileName: string;
  createTime: number;
  updateTime: number;
}
