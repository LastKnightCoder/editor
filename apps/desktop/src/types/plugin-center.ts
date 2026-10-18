/** 插件中心公开接口的客户端视图，字段以 apps/plugin-portal/contracts 的 Catalog / PublicRelease 为准。 */
export interface PluginPublisher {
  login: string;
  avatarUrl: string;
}

export interface PluginCatalogVersion {
  releaseId: string;
  version: string;
  minAppVersion: string;
  publishedAt: string;
  size: number;
  sha256: string;
  downloadUrl: string;
}

export interface PluginCatalogEntry {
  downloadsTotal: number;
  downloads7d: number;
  pluginId: string;
  name: string;
  description: string;
  publisher: PluginPublisher;
  repository: string;
  latest: PluginCatalogVersion;
  /** 当前客户端可安装的最高版本，没有时为 null。 */
  compatible: PluginCatalogVersion | null;
}

export interface PluginCatalog {
  items: PluginCatalogEntry[];
  windowStart?: string;
}
export type PluginCatalogSort = "downloads7d" | "downloadsTotal" | "updated";

/** 与门户 PluginCommunity / PluginComment 对齐，不含安装级匿名凭证。 */
export interface PluginComment {
  id: string;
  message: string;
  createdAt: string;
  canDelete: boolean;
  deleted: boolean;
}
export interface PluginCommunity {
  likes: number;
  liked: boolean;
  comments: PluginComment[];
  nextCursor: string | null;
}

/** 插件在中心的一个已发布版本；compatible 按当前客户端版本由主进程判定。 */
export interface PluginVersionRecord {
  releaseId: string;
  version: string;
  minAppVersion: string;
  publishedAt: string | null;
  compatible: boolean;
}

export interface PluginRelease {
  id: string;
  pluginId: string;
  version: string;
  state: "pending" | "publishing" | "published" | "failed";
  sha256: string;
  size: number;
  publishedAt: string | null;
  repository: string;
  commit: string;
  publisher: PluginPublisher;
  content: {
    manifest: { name: string; description: string; minAppVersion: string };
    readme: string;
    changelog: string | null;
  };
}
