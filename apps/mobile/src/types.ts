import type { Descendant } from "slate";

export interface DatabaseItem {
  name: string;
  version: number;
}

export interface BootstrapResponse {
  appDir: string;
  settingPath: string;
  activeDatabase: string;
  databases: DatabaseItem[];
}

export interface DatabaseListResponse {
  activeDatabase: string;
  databases: DatabaseItem[];
}

export interface ActiveDatabaseResponse {
  activeDatabase: string;
  created: boolean;
}

export interface CardListItem {
  id: number;
  contentId: number;
  updateTime: number;
  category: string;
  tags: string[];
  excerpt: string;
  content: Descendant[];
}

export interface CardDetailResponse {
  id: number;
  contentId: number;
  createTime: number;
  updateTime: number;
  category: string;
  tags: string[];
  links: number[];
  content: Descendant[];
  count: number;
}

export interface ContentCardMeta {
  id: number;
  createTime: number;
  updateTime: number;
  category: string;
  tags: string[];
  links: number[];
}

export interface ContentDetailResponse {
  contentId: number;
  createTime: number;
  updateTime: number;
  content: Descendant[];
  count: number;
  card: ContentCardMeta | null;
}

export interface CardsOverviewResponse {
  total: number;
  page: number;
  pageSize: number;
  query: string;
  category: string;
  searchMode: "none" | "fts" | "like" | string;
  items: CardListItem[];
}

export interface CardsQueryState {
  query: string;
  category: string;
  page: number;
  pageSize: number;
}

export interface SyncVersionResponse {
  databaseName: string;
  localVersion: number;
  remoteVersion: number;
}

export interface SyncActionResponse {
  ok: boolean;
  code?: string | null;
  message: string;
  databaseName: string;
  localVersion: number;
  remoteVersion: number;
}

export type ResourceSyncStatus = "pending" | "syncing" | "synced" | "error";

export interface ResourceFileSyncStatus {
  syncStatus: ResourceSyncStatus;
  syncDirection: "upload" | "download" | null | string;
  fileSize: number | null;
  lastSyncTime: number | null;
  errorMessage: string | null;
  retryCount: number;
}

export interface ResourceSyncStatusFile {
  provider: string;
  config: Record<string, string>;
  lastSyncTime: number | null;
  files: Record<string, ResourceFileSyncStatus>;
}

export interface ResourceSyncProgress {
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

export interface ResourceSyncActionResponse {
  ok: boolean;
  code?: string | null;
  message: string;
}

export interface SettingWriteResponse {
  ok: boolean;
  code?: string | null;
  message: string;
}

export interface DatabaseSchemaStatusResponse {
  databaseName: string;
  mainSchemaVersion: number;
  indexSchemaVersion: number;
  mainSchemaHash: string;
  indexSchemaHash: string;
  mainTableCount: number;
  indexTableCount: number;
}

export interface SettingCompat {
  database: {
    active: string;
    databases: DatabaseItem[];
  };
  imageBed: {
    active: "local" | "github" | "aliOSS" | "s3" | "webdav" | string;
    enableCompression: boolean;
    github: {
      repo: string;
      branch: string;
      cdn: string | null;
      pathPrefix: string;
    };
    aliOSS: {
      bucket: string;
      region: string;
      pathPrefix: string;
    };
    local: {
      path: string;
    };
    s3: {
      bucket: string;
      region: string;
      pathPrefix: string;
    };
    webdav: {
      pathPrefix: string;
    };
  };
  sync: {
    active: "webdav" | "aliOSS" | "s3" | "github" | string;
    webdav: {
      pathPrefix: string;
    };
    aliOSS: {
      bucket: string;
      region: string;
      path: string;
    };
    s3: {
      bucket: string;
      region: string;
      pathPrefix: string;
    };
    github: {
      repo: string;
      branch: string;
      pathPrefix: string;
    };
  };
  integration: {
    github: {
      token: string;
      user: {
        name: string;
        email: string;
      };
    };
    s3: {
      accessKeyId: string;
      secretAccessKey: string;
      endpoint: string;
      urlStyle: "path" | "virtualHosted" | string;
    };
    webdav: {
      url: string;
      username: string;
      password: string;
    };
    aliOSS: {
      accessKeyId: string;
      accessKeySecret: string;
    };
  };
  [key: string]: unknown;
}
