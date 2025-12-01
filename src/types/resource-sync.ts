export enum ResourceSyncStatus {
  Pending = "pending",
  Syncing = "syncing",
  Synced = "synced",
  Error = "error",
}

export interface IFileSyncStatus {
  syncStatus: ResourceSyncStatus;
  syncDirection: "upload" | "download" | null;
  fileSize: number | null;
  lastSyncTime: number | null;
  errorMessage: string | null;
  retryCount: number;
}

export interface ISyncStatusFile {
  provider: "alioss" | "s3" | "webdav" | "github";
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

export type ResourceSyncProvider = "alioss" | "s3" | "webdav" | "github";

interface BaseResourceSyncOptions {
  provider: ResourceSyncProvider;
  rateLimit?: Partial<IRateLimitConfig>;
}

export interface AliossResourceSyncOptions extends BaseResourceSyncOptions {
  provider: "alioss";
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
  path?: string;
}

export interface S3ResourceSyncOptions extends BaseResourceSyncOptions {
  provider: "s3";
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  endpoint?: string;
  urlStyle?: "path" | "virtualHosted";
  pathPrefix?: string;
}

export interface WebDavResourceSyncOptions extends BaseResourceSyncOptions {
  provider: "webdav";
  url: string;
  username: string;
  password: string;
  pathPrefix?: string;
}

export interface GithubResourceSyncOptions extends BaseResourceSyncOptions {
  provider: "github";
  token: string;
  repo: string;
  branch: string;
  pathPrefix?: string;
  user: {
    name: string;
    email: string;
  };
}

export type ResourceSyncOptions =
  | AliossResourceSyncOptions
  | S3ResourceSyncOptions
  | WebDavResourceSyncOptions
  | GithubResourceSyncOptions;

export const RATE_LIMIT_CONFIGS: Record<string, IRateLimitConfig> = {
  alioss: {
    maxConcurrent: 5,
    requestsPerSecond: 50,
    retryCount: 3,
    retryDelayMs: 1000,
    retryBackoffMultiplier: 2,
  },
  s3: {
    maxConcurrent: 5,
    requestsPerSecond: 50,
    retryCount: 3,
    retryDelayMs: 1000,
    retryBackoffMultiplier: 2,
  },
  webdav: {
    maxConcurrent: 2,
    requestsPerSecond: 5,
    retryCount: 3,
    retryDelayMs: 2000,
    retryBackoffMultiplier: 2,
  },
  github: {
    maxConcurrent: 1,
    requestsPerSecond: 0.5,
    retryCount: 5,
    retryDelayMs: 5000,
    retryBackoffMultiplier: 3,
  },
};
