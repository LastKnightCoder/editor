import { invoke } from "@/electron";
import { withModule } from "./module-init";
import type { LocalPluginScan } from "@/types/plugin-local";
import type { DevelopmentPluginPackage } from "@tau/plugins/host";
export const getContentPluginStartup = (): Promise<{
  artifacts: DevelopmentPluginPackage[];
  errors: Record<string, string>;
}> => withModule("plugin-local", () => invoke("plugin-local:content-startup"));
export const setContentPluginEnabled = (id: string, enabled: boolean): Promise<void> =>
  withModule("plugin-local", () => invoke("plugin-local:content-enabled", id, enabled));
import type { PluginCatalog, PluginRelease, PluginVersionRecord } from "@/types/plugin-center";

export const getPluginWorkspace = (name: string): Promise<string> =>
  withModule("plugin-local", () => invoke("plugin-local:workspace", name));
export const scanLocalPlugins = (): Promise<LocalPluginScan> =>
  withModule("plugin-local", () => invoke("plugin-local:scan"));
export const openPluginDirectory = (): Promise<void> =>
  withModule("plugin-local", () => invoke("plugin-local:open-directory"));
export const stagePluginZip = (): Promise<{ id: string; version: string } | null> =>
  withModule("plugin-local", () => invoke("plugin-local:stage-zip"));
export const restoreLocalPlugin = (id: string): Promise<{ id: string; version: string }> =>
  withModule("plugin-local", () => invoke("plugin-local:restore", id));
export const cancelLocalPluginUpdate = (id: string): Promise<void> =>
  withModule("plugin-local", () => invoke("plugin-local:cancel-update", id));
export const fetchPluginCatalog = (query?: string): Promise<PluginCatalog> =>
  withModule("plugin-local", () => invoke("plugin-local:catalog", query));
export const fetchPluginRelease = (id: string): Promise<PluginRelease> =>
  withModule("plugin-local", () => invoke("plugin-local:release", id));
export const fetchPluginVersions = (pluginId: string): Promise<PluginVersionRecord[]> =>
  withModule("plugin-local", () => invoke("plugin-local:versions", pluginId));
/** 下载、核对并暂存插件中心版本，下次完整启动生效。 */
export const stagePluginRelease = (id: string): Promise<{ id: string; version: string }> =>
  withModule("plugin-local", () => invoke("plugin-local:stage-release", id));
export const uninstallLocalPlugin = (id: string): Promise<void> =>
  withModule("plugin-local", () => invoke("plugin-local:uninstall", id));
/** 待生效的安装与更新在完整重启时切换。 */
export const relaunchForPlugins = (): Promise<void> =>
  withModule("plugin-local", () => invoke("plugin-local:relaunch"));
