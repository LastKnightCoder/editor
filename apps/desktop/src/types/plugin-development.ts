import type { DevelopmentPluginPackage, PluginManifest } from "@tau/plugins/host";

/** 桌面主进程与渲染端共用的开发插件 IPC 数据契约。 */

export interface DevelopmentPluginRecord {
  manifest: PluginManifest;
  directory: string;
  enabled: boolean;
  starting: boolean;
}

export interface RestoredDevelopmentPlugin extends DevelopmentPluginRecord {
  artifact?: DevelopmentPluginPackage;
  error?: string;
}

export interface DevelopmentSession {
  token: string;
  workspaceId: string;
  plugins: RestoredDevelopmentPlugin[];
  skipStartup: boolean;
}

export interface PreparedDevelopmentReload {
  ticket: string;
  record: RestoredDevelopmentPlugin;
}
