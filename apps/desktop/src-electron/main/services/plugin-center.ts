import { net } from "electron";
import { createHash } from "node:crypto";
import type { LocalPluginSource } from "@/types/plugin-local";
import type { PluginCatalog, PluginRelease } from "@/types/plugin-center";

// 门户 CORS 只放行网页门户，客户端请求统一经主进程；环境变量仅用于本地 Worker 联调。
const API_ORIGIN = process.env.TAU_PLUGIN_CENTER_API || "https://plugins-api.taunote.app";
// 与门户 ZIP 上限一致，超限的发布记录不下载。
const MAX_PACKAGE_BYTES = 8 * 1024 * 1024;

async function request<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await net.fetch(API_ORIGIN + path);
  } catch {
    throw new Error("暂时连不上插件中心，请检查网络后重试");
  }
  const body = (await response.json().catch(() => null)) as {
    data?: T;
    error?: { message?: string };
  } | null;
  if (!response.ok || !body || body.data === undefined)
    throw new Error(body?.error?.message || `插件中心请求失败（${response.status}）`);
  return body.data;
}

function assertReleaseId(id: string) {
  if (!/^[\w-]{1,64}$/.test(id)) throw new Error("插件版本标识无效");
}

export function fetchPluginCatalog(appVersion: string, query = "") {
  const params = new URLSearchParams({ appVersion });
  if (query.trim()) params.set("q", query.trim());
  return request<PluginCatalog>(`/v1/catalog?${params}`);
}

export async function fetchPluginRelease(id: string) {
  assertReleaseId(id);
  return request<PluginRelease>(`/v1/releases/${id}`);
}

/** 下载已发布版本并按发布记录核对大小与摘要；地址由本服务拼接，不信任调用方 URL。 */
export async function downloadPluginRelease(id: string) {
  const release = await fetchPluginRelease(id);
  if (release.state !== "published") throw new Error("该版本尚未发布");
  if (release.size > MAX_PACKAGE_BYTES) throw new Error("插件包超过大小上限");
  let response: Response;
  try {
    response = await net.fetch(`${API_ORIGIN}/v1/releases/${id}/download`);
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
  const source: Extract<LocalPluginSource, { kind: "center" }> = {
    kind: "center",
    releaseId: release.id,
    pluginId: release.pluginId,
    version: release.version,
    sha256: release.sha256,
  };
  return { bytes, source };
}
