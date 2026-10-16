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
