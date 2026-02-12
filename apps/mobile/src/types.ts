import { Descendant } from "slate";

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
  updateTime: number;
  category: string;
  tags: string[];
  excerpt: string;
  content: Descendant[];
}

export interface CardDetailResponse {
  id: number;
  createTime: number;
  updateTime: number;
  category: string;
  tags: string[];
  links: string[];
  content: Descendant[];
  count: number;
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

export interface SettingWriteResponse {
  ok: boolean;
  code?: string | null;
  message: string;
}

export interface SettingCompat {
  database: {
    active: string;
    databases: DatabaseItem[];
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
  };
  integration: {
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
