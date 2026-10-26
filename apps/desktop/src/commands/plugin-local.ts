import { invoke } from "@/electron";
import { withModule } from "./module-init";
import type { UploadRequest } from "../../shared/upload-renderer";
export const uploadPluginResource = (
  request: UploadRequest,
  signal?: AbortSignal
): Promise<string> =>
  withModule("plugin-local", async () => {
    signal?.throwIfAborted();
    const requestId = crypto.randomUUID();
    const cancel = () => {
      void window.electron.invoke("plugin-local:upload-cancel", requestId).catch(() => undefined);
    };
    const pending = invoke<string>("plugin-local:upload", request, requestId);
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      const url = await pending;
      signal?.throwIfAborted();
      return url;
    } catch (error) {
      signal?.throwIfAborted();
      throw error;
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  });
import type { LocalPluginScan } from "@/types/plugin-local";
import type { DesktopPluginPackage as DevelopmentPluginPackage } from "../../shared/plugin-package";
export const getContentPluginStartup = (): Promise<{
  artifacts: DevelopmentPluginPackage[];
  errors: Record<string, string>;
}> => withModule("plugin-local", () => invoke("plugin-local:content-startup"));
export const setLocalPluginEnabled = (id: string, enabled: boolean): Promise<void> =>
  withModule("plugin-local", () => invoke("plugin-local:set-enabled", id, enabled));
export const savePluginSyncConfig = (
  id: string,
  config: import("@tau/plugins").JsonValue
): Promise<void> =>
  withModule("plugin-local", () => invoke("plugin-local:sync-config", id, config));
import type {
  PluginCatalog,
  PluginCatalogSort,
  PluginRelease,
  PluginVersionRecord,
  PluginCommunity,
  PluginComment,
} from "@/types/plugin-center";

export const getPluginWorkspace = (name: string): Promise<string> =>
  withModule("plugin-local", () => invoke("plugin-local:workspace", name));
export const savePluginUploadConfig = (
  id: string,
  config: import("@tau/plugins").JsonValue
): Promise<void> =>
  withModule("plugin-local", () => invoke("plugin-local:upload-config", id, config));
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
export const fetchPluginCatalog = (
  query?: string,
  sort?: PluginCatalogSort
): Promise<PluginCatalog> =>
  withModule("plugin-local", () => invoke("plugin-local:catalog", query, sort));
export const fetchPluginRelease = (id: string): Promise<PluginRelease> =>
  withModule("plugin-local", () => invoke("plugin-local:release", id));
export const fetchPluginVersions = (pluginId: string): Promise<PluginVersionRecord[]> =>
  withModule("plugin-local", () => invoke("plugin-local:versions", pluginId));
export const fetchPluginCommunity = (id: string, cursor: string | null): Promise<PluginCommunity> =>
  withModule("plugin-local", () => invoke("plugin-local:community", id, cursor));
export const setPluginLiked = (id: string, liked: boolean): Promise<{ liked: boolean }> =>
  withModule("plugin-local", () => invoke("plugin-local:like", id, liked));
export const addPluginComment = (
  id: string,
  message: string,
  requestId: string
): Promise<PluginComment> =>
  withModule("plugin-local", () => invoke("plugin-local:comment", id, message, requestId));
export const deletePluginComment = (id: string, commentId: string): Promise<{ deleted: boolean }> =>
  withModule("plugin-local", () => invoke("plugin-local:delete-comment", id, commentId));
/** 下载、核对并安装插件中心版本；涉及已启用内容快照的更新延至重启。 */
export const stagePluginRelease = (id: string): Promise<{ id: string; version: string }> =>
  withModule("plugin-local", () => invoke("plugin-local:stage-release", id));
export const uninstallLocalPlugin = (id: string): Promise<void> =>
  withModule("plugin-local", () => invoke("plugin-local:uninstall", id));
/** 待生效的安装与更新在完整重启时切换。 */
export const relaunchForPlugins = (): Promise<void> =>
  withModule("plugin-local", () => invoke("plugin-local:relaunch"));
