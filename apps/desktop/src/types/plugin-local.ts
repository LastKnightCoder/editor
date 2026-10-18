import type { DevelopmentPluginPackage } from "@tau/plugins/host";

/** 安装来源：只有插件中心来源参与在线更新与首次自动启用。 */
export type LocalPluginSource =
  | { kind: "zip" }
  | { kind: "center"; releaseId: string; pluginId: string; version: string; sha256: string };

export interface LocalPluginEntry {
  id: string;
  directory: string;
  source?: LocalPluginSource;
  enabled?: boolean;
  artifact?: DevelopmentPluginPackage;
  error?: string;
}

export interface LocalPluginScan {
  directory: string;
  entries: LocalPluginEntry[];
  updates?: LocalPluginUpdate[];
  clientVersion?: string;
}

export interface LocalPluginUpdate {
  id: string;
  pending?: boolean;
  pendingVersion?: string;
  previousVersion?: string;
  error?: string;
  blocked?: boolean;
}
