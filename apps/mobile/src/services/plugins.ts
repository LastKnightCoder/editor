import { invoke } from "@tauri-apps/api/core";
import type { StorageAdapter } from "@tau/plugins/host";
import { copyJson } from "@tau/plugins/host";
import type { PortablePluginManifest } from "@tau/plugins/portable";
import {
  validatePortablePluginManifest,
  assertPortablePluginCompatibility,
} from "@tau/plugins/portable";
import type { PluginEnvironment } from "@tau/plugins";

export interface MobilePluginArtifact {
  manifest: PortablePluginManifest;
  code: string;
  css?: string;
}
export interface MobilePluginPackage {
  id: string;
  artifact?: MobilePluginArtifact;
  enabled: boolean;
  error?: string;
  hasBackup?: boolean;
  pending?: boolean;
}
export interface MobilePluginInventory {
  appVersion: string;
  platform: PluginEnvironment["platform"];
  packages: MobilePluginPackage[];
  development: boolean;
}
export interface PluginInstallSource {
  id: string;
  version: string;
  url: string;
  sha256: string;
  size: number;
}
export const applyPendingMobilePlugins = () => invoke<void>("plugin_apply_pending");
export const readMobilePlugins = () => invoke<MobilePluginInventory>("plugin_packages");
export const setMobilePluginEnabled = (id: string, enabled: boolean) =>
  invoke<void>("plugin_set_enabled", { id, enabled });
export const removeMobilePlugin = (id: string) => invoke<void>("plugin_uninstall", { id });
export const restoreMobilePlugin = (id: string) => invoke<void>("plugin_restore", { id });
export const cancelMobilePlugin = (id: string) => invoke<void>("plugin_cancel", { id });

export async function verifyMobilePlugin(
  artifact: MobilePluginArtifact,
  environment: PluginEnvironment,
  appVersion: string
) {
  const manifest = validatePortablePluginManifest(artifact.manifest);
  assertPortablePluginCompatibility(manifest, {
    environment,
    appVersion,
    profiles: ["web-v1"],
  });
  for (const [file, text] of [
    [manifest.main, artifact.code],
    ...(manifest.styles ? [[manifest.styles, artifact.css]] : []),
  ]) {
    if (typeof file !== "string" || typeof text !== "string") throw new Error("包入口缺失");
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    const actual = [...new Uint8Array(hash)]
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join("");
    if (actual !== manifest.integrity[file]) throw new Error("插件摘要不匹配");
  }
  return { ...artifact, manifest };
}

export async function installMobilePlugin(
  source: PluginInstallSource,
  environment: PluginEnvironment,
  appVersion: string
) {
  if (!import.meta.env.DEV && import.meta.env.MODE !== "plugin-validation")
    throw new Error("生产构建未开放跨端插件安装");
  const staged = await invoke<{ artifact: MobilePluginArtifact; sha256: string }>("plugin_stage", {
    source,
  });
  try {
    await verifyMobilePlugin(staged.artifact, environment, appVersion);
    await invoke("plugin_commit", { id: source.id, sha256: staged.sha256 });
  } catch (error) {
    await cancelMobilePlugin(source.id);
    throw error;
  }
}

export function mobilePluginStorage(database: string): StorageAdapter {
  return {
    async get(scope, key) {
      scope.signal.throwIfAborted();
      const result = await invoke<string | null>("plugin_kv_read", {
        database,
        pluginId: scope.pluginId,
        key,
      });
      scope.signal.throwIfAborted();
      return result === null ? undefined : copyJson(JSON.parse(result));
    },
    async set(scope, key, value) {
      scope.signal.throwIfAborted();
      await invoke("plugin_kv_write", {
        database,
        pluginId: scope.pluginId,
        key,
        value: copyJson(value),
        remove: false,
      });
      scope.signal.throwIfAborted();
    },
    async delete(scope, key) {
      scope.signal.throwIfAborted();
      await invoke("plugin_kv_write", { database, pluginId: scope.pluginId, key, remove: true });
      scope.signal.throwIfAborted();
    },
  };
}

export const MOBILE_PLUGIN_QUERY = ["mobile-plugins"] as const;

export const clearMobilePluginData = (database: string, pluginId: string) =>
  invoke<void>("plugin_kv_clear", { database, pluginId });
