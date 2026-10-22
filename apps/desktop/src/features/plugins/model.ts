import { useSyncExternalStore } from "react";
import type { PluginInfo } from "@tau/plugins/host";
import { comparePluginVersions, type PluginContributionKind } from "@tau/plugins/host";
import { PLUGIN_CATEGORIES, type PluginSystemAccess } from "@tau/plugins/package";
import type { DesktopPluginRuntime } from "@/app/plugins/runtime";
import type { LocalPluginUpdate } from "@/types/plugin-local";
import type { PluginCatalogEntry, PluginVersionRecord } from "@/types/plugin-center";

/** 发现页分类菜单：只列有插件的分类，顺序同词表；客户端不认识的分类已在类型层被忽略。 */
export function catalogCategories(entries: readonly PluginCatalogEntry[]) {
  return PLUGIN_CATEGORIES.map(item => ({
    ...item,
    count: entries.filter(entry => entry.categories?.includes(item.id)).length,
  })).filter(item => item.count > 0);
}

/** 详情页「此插件提供」的显示顺序与文案，按运行时实际注册统计。 */
export const CONTRIBUTION_LABELS: Record<PluginContributionKind, string> = {
  page: "页面",
  sidebar: "侧边栏入口",
  command: "命令",
  settings: "设置分组",
  sync: "同步方式",
  upload: "上传方式",
  tts: "语音服务",
  images: "图片服务",
  video: "视频来源",
  publish: "博客发布",
  mcp: "MCP 服务",
  chat: "聊天工具展示",
  skill: "Skill",
  ai: "AI 功能",
  editor: "编辑器扩展",
  whiteboard: "白板扩展",
  excerpts: "摘录来源",
  home: "首页面板",
  action: "对象动作",
  "entity-panel": "详情区块",
};

export const PLUGIN_TEMPLATE_URL = "https://github.com/LastKnightCoder/tau-plugin-template";
export const PLUGIN_PORTAL_URL = "https://plugins.taunote.app";

export const SYSTEM_ACCESS_LABELS: Record<PluginSystemAccess, string> = {
  filesystem: "文件",
  network: "网络",
  process: "外部程序",
};

const SKIP_INSTALL_NOTICE_KEY = "plugins:skip-install-notice";
const installNoticeListeners = new Set<() => void>();

/** 普通插件安装前的风险提示可由用户关闭；含后台的插件不受此偏好影响。 */
export function readSkipInstallNotice() {
  try {
    return window.localStorage.getItem(SKIP_INSTALL_NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveSkipInstallNotice(skip: boolean) {
  try {
    if (skip) window.localStorage.setItem(SKIP_INSTALL_NOTICE_KEY, "1");
    else window.localStorage.removeItem(SKIP_INSTALL_NOTICE_KEY);
  } catch {
    // 存储不可用时沿用默认的提示行为
  }
  installNoticeListeners.forEach(listener => listener());
}

/** 安装弹窗与插件页菜单共用同一偏好，任一处修改另一处随即更新。 */
export function useSkipInstallNotice() {
  return useSyncExternalStore(listener => {
    installNoticeListeners.add(listener);
    return () => installNoticeListeners.delete(listener);
  }, readSkipInstallNotice);
}

/** 待重启生效的暂存数，插件页与详情页共用。 */
export const pendingCount = (runtime: DesktopPluginRuntime | null) =>
  new Set([
    ...(runtime?.local?.updates.filter(item => item.pending).map(item => item.id) ?? []),
    ...(runtime?.local?.pendingContentIds?.() ?? []),
  ]).size;

export type PluginSourceKind = "center" | "zip";

export const SOURCE_LABELS: Record<PluginSourceKind, string> = {
  center: "插件中心",
  zip: "本地 ZIP",
};

export const STATE_LABELS: Record<PluginInfo["state"], string> = {
  disabled: "已停用",
  activating: "正在启用",
  active: "已启用",
  deactivating: "正在停用",
  failed: "启用失败",
  "restart-required": "需要重启",
};

/** 不含代码的安装包：安装即生效，不参与启停。 */
export type StaticPackageKind = "template" | "skills";
export const STATIC_PACKAGE_LABELS: Record<StaticPackageKind, { kind: string; state: string }> = {
  template: { kind: "博客模板", state: "模板已安装" },
  skills: { kind: "Skill 包", state: "Skill 已可用" },
};

export interface InstalledPlugin {
  packageKind?: StaticPackageKind;
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
  return runtime.local?.source(id)?.kind === "center" ? "center" : "zip";
}

export function installedPlugins(runtime: DesktopPluginRuntime): InstalledPlugin[] {
  const statics = [...(runtime.local?.templates ?? []), ...(runtime.local?.skillPackages ?? [])];
  const infos: PluginInfo[] = [
    ...runtime.host.listPlugins(),
    ...statics.map(template => ({
      id: template.id,
      name: template.name,
      version: template.version,
      state: "active" as const,
    })),
  ];
  return infos.map(info => {
    const source = pluginSource(runtime, info.id);
    const local = runtime.local?.owns(info.id) ? runtime.local : undefined;
    const origin = local?.source(info.id);
    const error =
      info.state === "restart-required"
        ? "插件清理未能确认完成，请重启应用后再启用。已保存的数据保留。"
        : (local?.error(info.id) ?? info.error);
    return {
      packageKind: runtime.local?.isTemplate(info.id)
        ? "template"
        : runtime.local?.isSkillPackage(info.id)
          ? "skills"
          : undefined,
      info,
      source,
      releaseId: origin?.kind === "center" ? origin.releaseId : undefined,
      update: runtime.local?.updates.find(item => item.id === info.id),
      enabled: local?.isStatic(info.id)
        ? true
        : local?.isContentPlugin?.(info.id)
          ? local.enabled(info.id)
          : Boolean(info.state === "active" || runtime.local?.enabled(info.id)),
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

export interface VersionRowModel {
  version: string;
  notes: string[];
  action?: "cancel-update" | "restore-previous";
}

/**
 * 版本页的行：中心全部已发布版本与本机状态（当前、待生效、上一版备份）按版本号合并，新版在前。
 * 中心版本未读到时退回目录里的最新版。
 */
export function versionRows(
  installed: InstalledPlugin | undefined,
  versions: readonly PluginVersionRecord[] | undefined,
  entry: PluginCatalogEntry | undefined
): VersionRowModel[] {
  const rows = new Map<string, VersionRowModel>();
  const row = (version: string) => {
    let value = rows.get(version);
    if (!value) rows.set(version, (value = { version, notes: [] }));
    return value;
  };
  const update = installed?.update;
  if (update?.pendingVersion)
    Object.assign(row(update.pendingVersion), { action: "cancel-update" }).notes.push(
      "已下载，重启后生效"
    );
  if (installed) row(installed.info.version).notes.push("当前使用");
  if (update?.previousVersion)
    Object.assign(row(update.previousVersion), { action: "restore-previous" }).notes.push(
      "上一版备份"
    );

  const published: readonly PluginVersionRecord[] =
    versions ??
    (entry
      ? [
          {
            ...entry.latest,
            compatible: entry.compatible?.releaseId === entry.latest.releaseId,
          },
        ]
      : []);
  const latest = published.reduce<string | undefined>(
    (max, item) => (!max || comparePluginVersions(item.version, max) > 0 ? item.version : max),
    undefined
  );
  for (const item of published) {
    const value = row(item.version);
    if (item.version === latest) value.notes.push("最新");
    if (!item.compatible) value.notes.push(`需要客户端 ≥ ${item.minAppVersion}`);
    if (item.publishedAt) value.notes.push(`${item.publishedAt.slice(0, 10)} 发布`);
  }
  return [...rows.values()].sort((a, b) => comparePluginVersions(b.version, a.version));
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
