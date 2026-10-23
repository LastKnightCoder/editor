import { app, net } from "electron";
import { createHash } from "node:crypto";
import { comparePluginVersions } from "@tau/plugins/host";
import type { LocalPluginSource } from "@/types/plugin-local";
import type { PluginCatalog, PluginRelease, PluginVersionRecord } from "@/types/plugin-center";
import type { PluginCatalogSort } from "@/types/plugin-center";
import type { PluginComment, PluginCommunity } from "@/types/plugin-center";
import { visitorHeaders } from "./plugin-center-visitor";
import { DISTRIBUTION_LIMITS, requiresSystemReview } from "@tau/plugins/template";
import {
  evaluateCenterCompatibility,
  type CenterCatalogPage,
  type CenterRelease,
  type CenterResolution,
  type CenterVersion,
} from "@tau/plugins/center";
import { desktopPluginHost } from "../../../shared/plugin-package";
import client from "../../../package.json";

// 门户 CORS 只放行网页门户，客户端请求统一经主进程；环境变量仅用于本地 Worker 联调。
export const API_ORIGIN =
  (!app.isPackaged && process.env.TAU_PLUGIN_CENTER_API) || "https://plugins-api.taunote.app";
// 与门户 ZIP 上限一致，超限的发布记录不下载。
const MAX_PACKAGE_BYTES = DISTRIBUTION_LIMITS.zipBytes;
// 版本列表按页读取（每页 20 条），超出的更早版本不再展示。
const MAX_VERSION_PAGES = 10;

export class PluginCenterError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit, readOnly = false): Promise<T> {
  let response: Response;
  try {
    response = init ? await net.fetch(API_ORIGIN + path, init) : await net.fetch(API_ORIGIN + path);
  } catch {
    throw new Error(
      !readOnly && init?.method && init.method !== "GET"
        ? "网络连接中断，请求结果未知，请刷新确认或重试"
        : "暂时连不上插件中心，请检查网络后重试"
    );
  }
  const body = (await response.json().catch(() => null)) as {
    data?: T;
    error?: { message?: string };
  } | null;
  if (!response.ok || !body || body.data === undefined)
    throw new PluginCenterError(
      body?.error?.message || `插件中心请求失败（${response.status}）`,
      response.status
    );
  return body.data;
}

function assertReleaseId(id: string) {
  if (!/^[\w-]{1,64}$/.test(id)) throw new Error("插件版本标识无效");
}

function assertPluginId(id: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id)) throw new Error("插件标识无效");
}

async function communityRequest<T>(
  pluginId: string,
  path: string,
  method = "GET",
  input?: unknown
) {
  assertPluginId(pluginId);
  const headers = await visitorHeaders(API_ORIGIN, true);
  return request<T>(`/v1/plugins/${pluginId}/${path}`, {
    method,
    headers: { ...headers, "X-Tau-Visitor": "1", "Content-Type": "application/json" },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    signal: AbortSignal.timeout(15000),
  });
}
export function fetchPluginCommunity(pluginId: string, cursor: string | null = null) {
  if (cursor !== null) assertReleaseId(cursor);
  return communityRequest<PluginCommunity>(
    pluginId,
    `community${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`
  );
}
export function setPluginLiked(pluginId: string, liked: boolean) {
  if (typeof liked !== "boolean") throw new Error("喜欢状态无效");
  return communityRequest<{ liked: boolean }>(pluginId, "like", "PUT", { liked });
}
export function addPluginComment(pluginId: string, message: string, clientRequestId: string) {
  if (typeof message !== "string" || !message.trim() || message.trim().length > 2000)
    throw new Error("评论需要1至2000字符");
  if (!/^[\w-]{16,80}$/.test(clientRequestId)) throw new Error("评论请求ID无效");
  return communityRequest<PluginComment>(pluginId, "comments", "POST", {
    message: message.trim(),
    clientRequestId,
  });
}
export function deletePluginComment(pluginId: string, commentId: string) {
  assertReleaseId(commentId);
  return communityRequest<{ deleted: boolean }>(pluginId, `comments/${commentId}`, "DELETE");
}

export async function fetchPluginCatalog(
  appVersion: string,
  query = "",
  sort: PluginCatalogSort = "downloads7d"
): Promise<PluginCatalog> {
  if (!["downloads7d", "downloadsTotal", "updated"].includes(sort)) throw new Error("插件排序无效");
  const input = {
    platform: "desktop",
    host: desktopPluginHost(appVersion),
    sort,
    q: query.trim(),
    cursor: null as string | null,
  };
  const entries = new Map<string, PluginCatalog["items"][number]>();
  const seen = new Set<string>();
  let windowStart: string | undefined;
  for (;;) {
    const page = await request<CenterCatalogPage>(
      "/v2/catalog/query",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(15000),
      },
      true
    );
    windowStart ??= page.windowStart;
    for (const item of page.items)
      if (!entries.has(item.pluginId))
        entries.set(item.pluginId, {
          ...item,
          categories: [...item.categories],
          keywords: [...item.keywords],
          latest: catalogVersion(item.latest),
          compatible: item.compatible ? catalogVersion(item.compatible) : null,
        });
    if (!page.nextCursor) break;
    if (seen.has(page.nextCursor)) throw new Error("插件目录分页异常，请刷新重试");
    seen.add(page.nextCursor);
    input.cursor = page.nextCursor;
  }
  return { items: [...entries.values()], ...(windowStart ? { windowStart } : {}) };
}

export async function fetchPluginRelease(id: string) {
  assertReleaseId(id);
  return releaseView(
    await request<CenterRelease>(`/v2/releases/${id}`, { signal: AbortSignal.timeout(10000) })
  );
}

function catalogVersion(version: CenterVersion) {
  return { ...version, minAppVersion: version.targets.desktop?.minAppVersion ?? "0.0.0" };
}
function releaseView(release: CenterRelease): PluginRelease {
  return { ...release, id: release.releaseId, state: "published" };
}

/** 插件的全部已发布版本，新版在前。 */
export async function fetchPluginVersions(
  appVersion: string,
  pluginId: string
): Promise<PluginVersionRecord[]> {
  assertPluginId(pluginId);
  const versions: PluginVersionRecord[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_VERSION_PAGES; page++) {
    const params = new URLSearchParams({ platform: "desktop" });
    if (cursor) params.set("cursor", cursor);
    const data = await request<{
      items: CenterRelease[];
      nextCursor: string | null;
    }>(`/v2/plugins/${pluginId}/releases?${params}`);
    for (const item of data.items)
      versions.push({
        releaseId: item.releaseId,
        version: item.version,
        minAppVersion: item.targets.desktop?.minAppVersion ?? "0.0.0",
        publishedAt: item.publishedAt,
        compatible:
          evaluateCenterCompatibility(item, desktopPluginHost(appVersion)).status === "compatible",
      });
    cursor = data.nextCursor;
    if (!cursor) break;
  }
  return versions.sort((a, b) => comparePluginVersions(b.version, a.version));
}

/** 下载已发布版本并按发布记录核对大小与摘要；地址由本服务拼接，不信任调用方 URL。 */
export async function downloadPluginRelease(id: string, appVersion = client.version) {
  assertReleaseId(id);
  const release = await request<CenterRelease>(`/v2/releases/${id}`, {
    signal: AbortSignal.timeout(10000),
  });
  assertPluginId(release.pluginId);
  if (release.releaseId !== id) throw new Error("发布记录身份不一致");
  if (requiresSystemReview(release.content.manifest) && release.systemReviewed !== true)
    throw new Error("该版本包含本机可执行代码，尚未完成系统能力审核");
  const resolve = () =>
    request<CenterResolution>(
      `/v2/plugins/${release.pluginId}/resolve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: desktopPluginHost(appVersion), releaseId: id }),
        signal: AbortSignal.timeout(10000),
      },
      true
    );
  const compatible = (value: CenterResolution) => {
    if (
      value.compatibility.status !== "compatible" ||
      value.release?.releaseId !== id ||
      value.release.sha256 !== release.sha256 ||
      JSON.stringify(value.release.content.manifest) !== JSON.stringify(release.content.manifest)
    )
      throw new Error("该版本不兼容当前桌面客户端或发布状态已变化");
  };
  compatible(await resolve());
  if (release.size > MAX_PACKAGE_BYTES) throw new Error("插件包超过大小上限");
  let response: Response;
  try {
    response = await net.fetch(`${API_ORIGIN}/v2/releases/${id}/download`, {
      headers: await visitorHeaders(API_ORIGIN),
    });
  } catch {
    throw new Error("插件下载中断，请检查网络后重试");
  }
  if (!response.ok) throw new Error(`插件下载失败（${response.status}）`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (
    bytes.length !== release.size ||
    createHash("sha256").update(bytes).digest("hex") !== release.sha256
  )
    throw new Error("下载的插件包摘要不匹配，已丢弃");
  compatible(await resolve());
  const source: Extract<LocalPluginSource, { kind: "center" }> = {
    kind: "center",
    releaseId: release.releaseId,
    pluginId: release.pluginId,
    version: release.version,
    sha256: release.sha256,
    systemReviewed: release.systemReviewed === true,
    manifest: release.content.manifest,
    apiOrigin: API_ORIGIN,
  };
  return { bytes, source };
}
