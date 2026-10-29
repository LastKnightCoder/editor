import { comparePluginVersions } from "@tau/plugins/package";
import { invoke } from "@tauri-apps/api/core";
import type { StorageAdapter } from "@tau/plugins/host";
import { copyJson } from "@tau/plugins/host";
import type { PortablePluginManifest } from "@tau/plugins/portable";
import { assertPortablePluginCompatibility } from "@tau/plugins/portable";
import {
  validateMobilePackageManifest,
  isSkillPackageManifest,
  assertSkillPackageCompatibility,
  type PortableSkillPackageManifest,
} from "@tau/plugins/template";
import type { PluginEnvironment } from "@tau/plugins";
import { isCenterStatusStale } from "./pluginCenterState";
export type MobilePluginArtifact =
  | { kind: "plugin"; manifest: PortablePluginManifest; code?: string; css?: string }
  | { kind: "skills"; manifest: PortableSkillPackageManifest; code?: never; css?: never };
export interface MobilePluginPackage {
  skillRevision?: string;
  name?: string | null;
  currentVersion?: string | null;
  pendingVersion?: string | null;
  revoked?: { reason: string; kind: "revoked" | "disabled" } | null;
  statusStale?: boolean;
  centerSource?: { origin: string; releaseId: string } | null;
  blocked?: boolean;
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
  managementEnabled?: boolean;
}
export interface PluginInstallSource {
  id: string;
  version: string;
  url: string;
  sha256: string;
  size: number;
}
export function readDevelopmentPluginSource(text: string): PluginInstallSource {
  const value = JSON.parse(text) as Record<string, unknown> | null;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof value.id !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value.id) ||
    typeof value.version !== "string" ||
    typeof value.url !== "string" ||
    typeof value.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.sha256) ||
    typeof value.size !== "number" ||
    !Number.isSafeInteger(value.size) ||
    value.size < 1 ||
    value.size > 16 * 1024 * 1024
  )
    throw new Error("开发包描述无效");
  comparePluginVersions(value.version, value.version);
  const url = new URL(value.url);
  if (
    url.username ||
    url.password ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
  )
    throw new Error("开发包地址必须为 HTTPS 或本机 HTTP");
  return {
    id: value.id,
    version: value.version,
    url: url.href,
    sha256: value.sha256,
    size: value.size,
  };
}

export const applyPendingMobilePlugins = () => invoke<void>("plugin_apply_pending");
export async function readMobilePlugins(): Promise<MobilePluginInventory> {
  const inventory = await invoke<MobilePluginInventory>("plugin_packages");
  return {
    ...inventory,
    packages: inventory.packages.map(item => ({
      ...item,
      statusStale: item.centerSource ? isCenterStatusStale(item.centerSource.origin) : false,
    })),
  };
}
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
  const manifest = validateMobilePackageManifest(artifact.manifest);
  if (isSkillPackageManifest(manifest)) {
    if (environment.platform === "web") throw new Error("Skill 包未声明当前宿主平台");
    assertSkillPackageCompatibility(manifest, { platform: environment.platform, appVersion });
    if (artifact.code !== undefined || artifact.css !== undefined)
      throw new Error("独立 Skill 包不接受代码或样式入口");
    return { kind: "skills" as const, manifest };
  }
  assertPortablePluginCompatibility(manifest, {
    environment,
    appVersion,
    profiles: ["web-v1"],
  });
  if (typeof artifact.code !== "string") throw new Error("包入口缺失");
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
  return {
    kind: "plugin" as const,
    manifest,
    code: artifact.code,
    ...(manifest.styles ? { css: artifact.css } : {}),
  };
}

export async function installMobilePlugin(
  source: PluginInstallSource,
  environment: PluginEnvironment,
  appVersion: string,
  signal?: AbortSignal
) {
  signal?.throwIfAborted();
  if (!import.meta.env.DEV && import.meta.env.MODE !== "plugin-validation")
    throw new Error("生产构建未开放跨端插件安装");
  const staged = await invoke<{ artifact: MobilePluginArtifact; sha256: string }>("plugin_stage", {
    source,
  });
  try {
    signal?.throwIfAborted();
    await verifyMobilePlugin(staged.artifact, environment, appVersion);
    signal?.throwIfAborted();
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
