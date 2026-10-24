import type { DistributionManifest } from "./template";
import type { PortablePlatform, ReadablePortablePluginManifest } from "./portable";
import { PORTABLE_PLATFORMS } from "./portable";
import type { PluginCategory } from "./categories";
import { isPluginCategory } from "./categories";
import { comparePluginVersions } from "./version";
import { PLUGIN_AI_CAPABILITIES, isPluginAICapability } from "./ai";

/** 分发契约供中心与客户端消费，不属于插件运行时能力。 */
export type LegacyCenterManifest = DistributionManifest & {
  description: string;
  minAppVersion: string;
};
export type CenterManifest =
  | LegacyCenterManifest
  | (ReadablePortablePluginManifest & { description: string; minAppVersion?: never });
export type CenterPlatform = PortablePlatform | "all";
export type CenterSort = "downloads7d" | "downloadsTotal" | "updated";
export interface CenterHost {
  platform: PortablePlatform;
  appVersion: string;
  apiVersions: readonly number[];
  formatVersions: readonly number[];
  profiles: readonly string[];
}
export interface CenterTarget {
  minAppVersion: string;
}
export type CenterTargets = Readonly<Partial<Record<PortablePlatform, CenterTarget>>>;
export type CenterReason =
  | { code: "FORMAT_UNSUPPORTED"; formatVersion: number }
  | { code: "API_UNSUPPORTED"; apiVersion: number }
  | { code: "PROFILE_UNSUPPORTED"; profile: string }
  | { code: "PLATFORM_UNSUPPORTED"; platform: PortablePlatform }
  | { code: "APP_VERSION_TOO_LOW"; minAppVersion: string }
  | { code: "DISTRIBUTION_UNAVAILABLE" | "REVOKED" | "PLUGIN_DISABLED" | "NO_RELEASE" };
export type CenterCompatibility =
  | { status: "unchecked"; reasons: readonly [] }
  | { status: "compatible"; reasons: readonly [] }
  | {
      status: "incompatible";
      reasons: readonly CenterReason[];
    };
export type CenterReleaseStatus = "available" | "revoked" | "disabled" | "not_found";
export interface CenterStatusItem {
  releaseId: string;
  status: CenterReleaseStatus;
  reason: string | null;
}
export interface CenterVersion {
  releaseId: string;
  version: string;
  formatVersion: 1 | 2 | 3;
  apiVersion: 1;
  profile: "web-v1" | null;
  targets: CenterTargets;
  publishedAt: string;
  size: number;
  sha256: string;
  downloadUrl: string;
}
export interface CenterRelease extends CenterVersion {
  pluginId: string;
  content: { manifest: CenterManifest; readme: string; changelog: string | null };
  publisher: { login: string; avatarUrl: string };
  repository: string;
  commit: string;
  systemReviewed: boolean;
}
export interface CenterCatalogEntry {
  pluginId: string;
  name: string;
  description: string;
  categories: readonly PluginCategory[];
  keywords: readonly string[];
  publisher: CenterRelease["publisher"];
  repository: string;
  downloadsTotal: number;
  downloads7d: number;
  likes: number;
  latest: CenterVersion;
  compatible: CenterVersion | null;
  compatibility: CenterCompatibility;
}
export interface CenterCatalogQuery {
  platform: CenterPlatform;
  host?: CenterHost;
  q?: string;
  category?: PluginCategory | null;
  sort?: CenterSort;
  limit?: number;
  cursor?: string | null;
}
export interface CenterCatalogPage {
  /** 首页返回各平台声明数；缺省兼容旧缓存，续页为 null。 */
  platformCounts?: Record<CenterPlatform, number> | null;
  items: CenterCatalogEntry[];
  nextCursor: string | null;
  windowStart: string;
  categoryCounts: Partial<Record<PluginCategory, number>> | null;
}
export interface CenterReleasesQuery {
  platform?: CenterPlatform;
  cursor?: string | null;
}
export interface CenterResolveInput {
  host: CenterHost;
  releaseId?: string;
}
export interface CenterResolution {
  release: CenterRelease | null;
  compatibility: CenterCompatibility;
}
export interface PluginCenterClient {
  queryCatalog(input: CenterCatalogQuery, signal?: AbortSignal): Promise<CenterCatalogPage>;
  listReleases(
    pluginId: string,
    input?: CenterReleasesQuery,
    signal?: AbortSignal
  ): Promise<{ items: CenterRelease[]; nextCursor: string | null }>;
  getRelease(releaseId: string, signal?: AbortSignal): Promise<CenterRelease>;
  resolve(
    pluginId: string,
    input: CenterResolveInput,
    signal?: AbortSignal
  ): Promise<CenterResolution>;
  statuses(
    releaseIds: readonly string[],
    signal?: AbortSignal
  ): Promise<{ items: CenterStatusItem[] }>;
  download(releaseId: string, signal?: AbortSignal): Promise<Blob>;
}

export function normalizeCenterHost(host: CenterHost): CenterHost {
  if (!host || !PORTABLE_PLATFORMS.includes(host.platform)) throw new Error("宿主平台无效");
  comparePluginVersions(host.appVersion, host.appVersion);
  const numbers = (values: readonly number[]) => {
    if (!Array.isArray(values) || values.some(value => !Number.isSafeInteger(value) || value < 1))
      throw new Error("宿主协议版本集合无效");
    return [...new Set(values)].sort((a, b) => a - b);
  };
  const names = (values: readonly string[]) => {
    if (!Array.isArray(values) || values.some(value => typeof value !== "string"))
      throw new Error("宿主运行配置无效");
    return [...new Set(values)].sort();
  };
  return {
    platform: host.platform,
    appVersion: host.appVersion,
    apiVersions: numbers(host.apiVersions),
    formatVersions: numbers(host.formatVersions),
    profiles: names(host.profiles),
  };
}

export function normalizeCenterQuery(input: CenterCatalogQuery) {
  if (!input || ![...PORTABLE_PLATFORMS, "all"].includes(input.platform))
    throw new Error("目录平台无效");
  const host = input.host ? normalizeCenterHost(input.host) : undefined;
  if (host && (input.platform === "all" || input.platform !== host.platform))
    throw new Error("目录与宿主平台不一致");
  const q = (input.q ?? "").trim().toLowerCase();
  const category = input.category ?? null;
  if (category !== null && !isPluginCategory(category)) throw new Error("分类无效");
  const sort = input.sort ?? "downloads7d";
  if (!["downloads7d", "downloadsTotal", "updated"].includes(sort)) throw new Error("排序无效");
  const limit = input.limit ?? 30;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("分页大小无效");
  const cursor = input.cursor ?? null;
  if (cursor !== null && (typeof cursor !== "string" || !cursor)) throw new Error("分页游标无效");
  return { platform: input.platform, ...(host ? { host } : {}), q, category, sort, limit, cursor };
}

export function centerManifestTargets(manifest: CenterManifest): CenterTargets {
  return manifest.formatVersion === 3
    ? Object.fromEntries(
        Object.entries(manifest.targets).map(([platform, target]) => [
          platform,
          { minAppVersion: target.minAppVersion },
        ])
      )
    : {
        desktop: { minAppVersion: manifest.minAppVersion },
      };
}

export function evaluateCenterCompatibility(
  version: CenterVersion,
  host?: CenterHost
): CenterCompatibility {
  if (!host) return { status: "unchecked", reasons: [] };
  const current = normalizeCenterHost(host);
  const reasons: CenterReason[] = [];
  if (!current.formatVersions.includes(version.formatVersion))
    reasons.push({ code: "FORMAT_UNSUPPORTED", formatVersion: version.formatVersion });
  if (!current.apiVersions.includes(version.apiVersion))
    reasons.push({ code: "API_UNSUPPORTED", apiVersion: version.apiVersion });
  if (version.profile && !current.profiles.includes(version.profile))
    reasons.push({ code: "PROFILE_UNSUPPORTED", profile: version.profile });
  const target = version.targets[current.platform];
  if (!target || (current.platform !== "desktop" && version.formatVersion !== 3))
    reasons.push({ code: "PLATFORM_UNSUPPORTED", platform: current.platform });
  if (target && comparePluginVersions(current.appVersion, target.minAppVersion) < 0)
    reasons.push({ code: "APP_VERSION_TOO_LOW", minAppVersion: target.minAppVersion });
  return reasons.length
    ? { status: "incompatible", reasons }
    : { status: "compatible", reasons: [] };
}

/** 输入只能是已通过发布状态核验的记录；这里不授予安装或执行权限。 */
export function resolveCenterRelease(
  releases: readonly CenterRelease[],
  input: CenterResolveInput
): CenterResolution {
  normalizeCenterHost(input.host);
  const candidates = releases
    .filter(release => !input.releaseId || release.releaseId === input.releaseId)
    .sort(
      (a, b) =>
        comparePluginVersions(b.version, a.version) ||
        b.publishedAt.localeCompare(a.publishedAt) ||
        a.releaseId.localeCompare(b.releaseId)
    );
  for (const release of candidates) {
    const compatibility = evaluateCenterCompatibility(release, input.host);
    if (compatibility.status === "compatible") return { release, compatibility };
  }
  return {
    release: null,
    compatibility: candidates.length
      ? evaluateCenterCompatibility(candidates[0], input.host)
      : { status: "incompatible", reasons: [{ code: "NO_RELEASE" }] },
  };
}

const permissionDomains = {
  cards: "卡片",
  articles: "文章",
  documents: "文档",
  whiteboards: "白板",
  projects: "项目",
  todos: "待办",
  calendar: "日历",
  notebooks: "笔记本",
  materials: "资料",
  chats: "对话",
  flashcards: "闪卡",
} as const;
const permissionActions = { read: "读取", write: "新增和修改", delete: "删除" } as const;

/** 比较声明变化，不表示旧版权限已经获得用户授权。 */
export function describeCenterPermissions(
  requested: readonly string[],
  previous: readonly string[] = []
) {
  const known = new Set(previous);
  return [...new Set(requested)].map(permission => {
    const [domain, action, extra] = permission.split(":");
    let label = permission;
    if (extra === undefined && domain === "ai" && isPluginAICapability(action)) {
      label = `使用 AI ${PLUGIN_AI_CAPABILITIES[action].name}`;
    } else if (
      extra === undefined &&
      Object.hasOwn(permissionDomains, domain) &&
      Object.hasOwn(permissionActions, action)
    ) {
      label = `${permissionActions[action as keyof typeof permissionActions]}${permissionDomains[domain as keyof typeof permissionDomains]}`;
    }
    return { permission, label, newlyRequested: !known.has(permission) };
  });
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

export const PLUGIN_PORTAL_URL = "https://plugins.taunote.app";
export const pluginPortalUrl = (pluginId: string) =>
  `${PLUGIN_PORTAL_URL}/plugins/${encodeURIComponent(pluginId)}`;
