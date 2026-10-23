import type { DistributionManifest } from "./template";
import type {
  PortablePlatform,
  ReadablePortablePluginManifest,
  PluginElementSupport,
} from "./portable";
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
  capabilities: readonly string[];
}
export interface CenterTarget {
  minAppVersion: string;
  required: readonly string[];
  optional: readonly string[];
  elements?: Readonly<Record<string, PluginElementSupport>>;
}
export type CenterTargets = Readonly<Partial<Record<PortablePlatform, CenterTarget>>>;
export type CenterReason =
  | { code: "FORMAT_UNSUPPORTED"; formatVersion: number }
  | { code: "API_UNSUPPORTED"; apiVersion: number }
  | { code: "PROFILE_UNSUPPORTED"; profile: string }
  | { code: "PLATFORM_UNSUPPORTED"; platform: PortablePlatform }
  | { code: "APP_VERSION_TOO_LOW"; minAppVersion: string }
  | { code: "CAPABILITY_MISSING"; capabilities: readonly string[] }
  | { code: "DISTRIBUTION_UNAVAILABLE" | "REVOKED" | "PLUGIN_DISABLED" | "NO_RELEASE" };
export type CenterCompatibility =
  | { status: "unchecked"; reasons: readonly []; missingOptional: readonly [] }
  | { status: "compatible"; reasons: readonly []; missingOptional: readonly string[] }
  | {
      status: "incompatible";
      reasons: readonly CenterReason[];
      missingOptional: readonly string[];
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
    if (
      !Array.isArray(values) ||
      values.length > 32 ||
      values.some(value => !Number.isSafeInteger(value) || value < 1)
    )
      throw new Error("宿主协议版本集合无效");
    return [...new Set(values)].sort((a, b) => a - b);
  };
  const names = (values: readonly string[]) => {
    if (
      !Array.isArray(values) ||
      values.length > 128 ||
      values.some(value => typeof value !== "string" || !/^[a-z][a-z0-9.-]{0,127}$/.test(value))
    )
      throw new Error("宿主能力或运行配置无效");
    return [...new Set(values)].sort();
  };
  return {
    platform: host.platform,
    appVersion: host.appVersion,
    apiVersions: numbers(host.apiVersions),
    formatVersions: numbers(host.formatVersions),
    profiles: names(host.profiles),
    capabilities: names(host.capabilities),
  };
}

export function normalizeCenterQuery(input: CenterCatalogQuery) {
  if (!input || ![...PORTABLE_PLATFORMS, "all"].includes(input.platform))
    throw new Error("目录平台无效");
  const host = input.host ? normalizeCenterHost(input.host) : undefined;
  if (host && (input.platform === "all" || input.platform !== host.platform))
    throw new Error("目录与宿主平台不一致");
  const q = (input.q ?? "").trim().toLowerCase();
  if (q.length > 200) throw new Error("搜索词过长");
  const category = input.category ?? null;
  if (category !== null && !isPluginCategory(category)) throw new Error("分类无效");
  const sort = input.sort ?? "downloads7d";
  if (!["downloads7d", "downloadsTotal", "updated"].includes(sort)) throw new Error("排序无效");
  const limit = input.limit ?? 30;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("分页大小无效");
  const cursor = input.cursor ?? null;
  if (cursor !== null && (typeof cursor !== "string" || !cursor || cursor.length > 4096))
    throw new Error("分页游标无效");
  return { platform: input.platform, ...(host ? { host } : {}), q, category, sort, limit, cursor };
}

export function centerManifestTargets(manifest: CenterManifest): CenterTargets {
  return manifest.formatVersion === 3
    ? manifest.targets
    : {
        desktop: { minAppVersion: manifest.minAppVersion, required: [], optional: [] },
      };
}

export function evaluateCenterCompatibility(
  version: CenterVersion,
  host?: CenterHost
): CenterCompatibility {
  if (!host) return { status: "unchecked", reasons: [], missingOptional: [] };
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
  const missing = target?.required.filter(name => !current.capabilities.includes(name)) ?? [];
  if (missing.length) reasons.push({ code: "CAPABILITY_MISSING", capabilities: missing });
  const missingOptional =
    target?.optional.filter(name => !current.capabilities.includes(name)) ?? [];
  return reasons.length
    ? { status: "incompatible", reasons, missingOptional }
    : { status: "compatible", reasons: [], missingOptional };
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
      : { status: "incompatible", reasons: [{ code: "NO_RELEASE" }], missingOptional: [] },
  };
}

export type PlatformReviewEvidence = Partial<
  Record<PortablePlatform, { verified: true; note: string }>
>;

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

/** 网页提交前与服务端审核共用；验收状态不能由包作者自报。 */
export function readCenterReviewEvidence(
  manifest: CenterManifest,
  value: unknown,
  approval: boolean
): PlatformReviewEvidence | null {
  if (manifest.formatVersion !== 3) {
    if (value !== undefined && value !== null) throw new Error("旧格式不接受跨端验收声明");
    return null;
  }
  if (!approval && value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("批准前须提交每个声明平台的验收说明");
  const source = value as Record<string, unknown>;
  const targets = Object.keys(manifest.targets);
  if (
    Object.keys(source).length !== targets.length ||
    Object.keys(source).some(key => !targets.includes(key))
  )
    throw new Error("平台验收必须与包声明完全一致");
  const evidence: PlatformReviewEvidence = {};
  for (const platform of PORTABLE_PLATFORMS) {
    if (!manifest.targets[platform]) continue;
    const item = source[platform] as Record<string, unknown> | null;
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      Object.keys(item).some(key => !["verified", "note"].includes(key)) ||
      item.verified !== true ||
      typeof item.note !== "string" ||
      !item.note.trim() ||
      item.note.length > 4000
    )
      throw new Error(`缺少 ${platform} 的有效验收说明`);
    evidence[platform] = { verified: true, note: item.note.trim() };
  }
  return evidence;
}
