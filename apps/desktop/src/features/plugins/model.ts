import type { PluginInfo } from "@tau/plugins/host";
import { comparePluginVersions } from "@tau/plugins/host";
import type { DesktopPluginRuntime } from "@/app/plugins/runtime";
import type { LocalPluginUpdate } from "@/types/plugin-local";
import type { PluginCatalogEntry } from "@/types/plugin-center";

export const PLUGIN_TEMPLATE_URL = "https://github.com/LastKnightCoder/tau-plugin-template";
export const PLUGIN_PORTAL_URL = "https://plugins.taunote.app";

/** 待重启生效的暂存数，插件页与详情页共用。 */
export const pendingCount = (runtime: DesktopPluginRuntime | null) =>
  new Set([
    ...(runtime?.local?.updates.filter(item => item.pending).map(item => item.id) ?? []),
    ...(runtime?.local?.pendingEditorIds?.() ?? []),
  ]).size;

export type PluginSourceKind = "center" | "zip" | "builtin" | "development";

export const SOURCE_LABELS: Record<PluginSourceKind, string> = {
  center: "插件中心",
  zip: "本地 ZIP",
  builtin: "内置",
  development: "开发中",
};

export const STATE_LABELS: Record<PluginInfo["state"], string> = {
  disabled: "已停用",
  activating: "正在启用",
  active: "已启用",
  deactivating: "正在停用",
  failed: "启用失败",
  "restart-required": "需要重启",
};

export interface InstalledPlugin {
  info: PluginInfo;
  source: PluginSourceKind;
  /** 中心来源对应的发布记录，用于读取 README 与核对更新。 */
  releaseId?: string;
  update?: LocalPluginUpdate;
  enabled: boolean;
  /** 宿主或管理器报告的错误；需要用户处理的插件置顶展示。 */
  error?: string;
}

export function pluginSource(runtime: DesktopPluginRuntime, id: string): PluginSourceKind {
  if (runtime.development?.owns(id)) return "development";
  if (runtime.local?.owns(id))
    return runtime.local.source(id)?.kind === "center" ? "center" : "zip";
  return "builtin";
}

export function installedPlugins(runtime: DesktopPluginRuntime): InstalledPlugin[] {
  return runtime.host.listPlugins().map(info => {
    const source = pluginSource(runtime, info.id);
    const local = runtime.local?.owns(info.id) ? runtime.local : undefined;
    const origin = local?.source(info.id);
    const error =
      info.state === "restart-required"
        ? "插件清理未能确认完成，请重启应用后再启用。已保存的数据保留。"
        : (runtime.development?.error(info.id) ??
          runtime.builtin?.error(info.id) ??
          local?.error(info.id) ??
          info.error);
    return {
      info,
      source,
      releaseId: origin?.kind === "center" ? origin.releaseId : undefined,
      update: runtime.local?.updates.find(item => item.id === info.id),
      enabled: local?.isEditorPlugin?.(info.id)
        ? local.enabled(info.id)
        : Boolean(
            info.state === "active" ||
            runtime.development?.enabled(info.id) ||
            runtime.local?.enabled(info.id) ||
            runtime.builtin?.enabled(info.id)
          ),
      error,
    };
  });
}

export const needsAttention = (plugin: InstalledPlugin) =>
  Boolean(plugin.error) || plugin.info.state === "failed" || Boolean(plugin.update?.blocked);

/** 插件中心卡片与详情页安装按钮的状态，同一按钮位按此切换。 */
export type InstallState =
  | { kind: "available"; releaseId: string; version: string }
  | { kind: "incompatible"; minAppVersion: string }
  | { kind: "staged"; version: string }
  | { kind: "installed" }
  | { kind: "update"; releaseId: string; version: string }
  | { kind: "local" };

export function installState(
  entry: PluginCatalogEntry,
  installed: InstalledPlugin | undefined,
  pending: LocalPluginUpdate | undefined
): InstallState {
  if (pending?.pendingVersion) return { kind: "staged", version: pending.pendingVersion };
  const target = entry.compatible;
  if (!installed) {
    if (!target) return { kind: "incompatible", minAppVersion: entry.latest.minAppVersion };
    return { kind: "available", releaseId: target.releaseId, version: target.version };
  }
  // 本地 ZIP / 开发 / 内置同 ID 不由中心接管，换源需先卸载。
  if (installed.source !== "center") return { kind: "local" };
  if (target && comparePluginVersions(target.version, installed.info.version) > 0)
    return { kind: "update", releaseId: target.releaseId, version: target.version };
  return { kind: "installed" };
}

/** 没有图标字段前用名称首字，配色按 ID 稳定散列到数据色。 */
export function pluginTone(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (hash % 5) + 1;
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function matchesQuery(text: readonly (string | undefined)[], query: string) {
  const q = query.trim().toLowerCase();
  return !q || text.some(value => value?.toLowerCase().includes(q));
}
