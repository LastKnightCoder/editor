import { comparePluginVersions } from "@tau/plugins/package";
import { fail, VISIBLE_PLUGIN, type Env } from "./platform";

export interface Metadata {
  id: string;
  plugin_id: string;
  version: string;
  format_version: 1 | 2 | 3 | 4;
  package_kind: "plugin" | "skills" | "template";
  distribution_platform: "desktop" | "portable";
  profile: "web-v1" | "desktop-v1" | null;
  targets_json: string;
  published_at: string;
  size: number;
  sha256: string;
  name: string;
  description: string;
  categories: string;
  keywords: string;
  repository: string;
  login: string;
  avatar_url: string;
}
interface CatalogMetadata extends Metadata {
  min_app_version: string;
  current_package: number;
  target_platforms: string;
}
const skillShape = (alias: string) =>
  `(${alias}.format_version=1 AND json_extract(${alias}.content_json,'$.manifest.apiVersion')=1 AND json_type(${alias}.content_json,'$.manifest.skills')='array' AND json_array_length(${alias}.content_json,'$.manifest.skills')>0 AND ${["main", "template", "backend", "format", "profile", "styles"].map(field => `json_type(${alias}.content_json,'$.manifest.${field}') IS NULL`).join(" AND ")})`;
// 包类型来自实际结构，作者自填的 packageKind 不参与分发裁决。
export const CURRENT_PACKAGE = `(r.format_version<>1 OR (${skillShape("r")} AND (json_extract(r.content_json,'$.manifest.platform')='desktop' OR (json_extract(r.content_json,'$.manifest.platform')='portable' AND json_type(r.content_json,'$.manifest.targets')='object'))) OR (json_extract(r.content_json,'$.manifest.platform')='desktop' AND json_type(r.content_json,'$.manifest.template')='object' AND json_type(r.content_json,'$.manifest.main') IS NULL))`;
export const columns = `r.id,r.plugin_id,r.version,r.format_version,r.profile,r.targets_json,r.published_at,r.size,r.sha256,r.name,r.description,r.categories,r.keywords,r.repository,p.login,p.avatar_url,json_extract(r.content_json,'$.manifest.platform') AS distribution_platform,CASE WHEN r.format_version=4 THEN json_extract(r.content_json,'$.manifest.kind') WHEN ${skillShape("r")} THEN 'skills' WHEN r.format_version=1 AND json_type(r.content_json,'$.manifest.template')='object' THEN 'template' ELSE 'plugin' END AS package_kind`;
export const platformWhere =
  "(?='all' OR EXISTS(SELECT 1 FROM release_targets t WHERE t.release_id=r.id AND t.platform=?))";
export const compare = (a: Metadata, b: Metadata) =>
  comparePluginVersions(b.version, a.version) ||
  b.published_at.localeCompare(a.published_at) ||
  a.id.localeCompare(b.id);

export interface CatalogData {
  versions: Map<string, CatalogMetadata[]>;
  totals: Map<string, number>;
  recent: Map<string, number>;
  likes: Map<string, number>;
}
interface CachedCatalog {
  revision: number;
  day: string;
  expiresAt: number;
  data: CatalogData;
}
interface LoadingCatalog {
  revision: number;
  day: string;
  promise: Promise<CatalogData>;
}
interface CatalogCache {
  generation?: object;
  value?: CachedCatalog;
  loading?: LoadingCatalog;
}
const caches = new WeakMap<Env["DB"], CatalogCache>();
const MAX_AGE_MS = 60_000;

async function revision(env: Env) {
  const row = await env.DB.prepare("SELECT revision FROM catalog_revision WHERE id=1").first<{
    revision: number;
  }>();
  if (!row) throw new Error("插件目录修订号缺失");
  return row.revision;
}

async function load(env: Env, day: string, windowStart: string): Promise<CatalogData> {
  const versions = new Map<string, CatalogMetadata[]>();
  let after = "";
  for (;;) {
    const page = await env.DB.prepare(
      `SELECT ${columns},r.min_app_version,CASE WHEN ${CURRENT_PACKAGE} THEN 1 ELSE 0 END AS current_package,
      (SELECT json_group_array(t.platform) FROM release_targets t WHERE t.release_id=r.id) AS target_platforms
      FROM releases r JOIN publishers p ON p.id=r.publisher_id
      WHERE r.state='published' AND ${VISIBLE_PLUGIN} AND r.id>? ORDER BY r.id LIMIT 200`
    )
      .bind(after)
      .all<CatalogMetadata>();
    for (const row of page.results) {
      const group = versions.get(row.plugin_id);
      if (group) group.push(row);
      else versions.set(row.plugin_id, [row]);
    }
    if (page.results.length < 200) break;
    after = page.results[page.results.length - 1].id;
  }
  for (const group of versions.values()) group.sort(compare);
  const [totals, recent, likes] = await Promise.all([
    env.DB.prepare("SELECT plugin_id,downloads AS n FROM plugin_download_totals").all<{
      plugin_id: string;
      n: number;
    }>(),
    env.DB.prepare(
      "SELECT plugin_id,SUM(downloads) AS n FROM plugin_download_daily WHERE day>=? AND day<=? GROUP BY plugin_id"
    )
      .bind(windowStart, day)
      .all<{ plugin_id: string; n: number }>(),
    env.DB.prepare("SELECT plugin_id,COUNT(*) AS n FROM plugin_likes GROUP BY plugin_id").all<{
      plugin_id: string;
      n: number;
    }>(),
  ]);
  const counts = (rows: { plugin_id: string; n: number }[]) =>
    new Map(rows.map(row => [row.plugin_id, row.n]));
  return {
    versions,
    totals: counts(totals.results),
    recent: counts(recent.results),
    likes: counts(likes.results),
  };
}

/** 每次校验失效标记，公开资料缓存不跨数据库，也不缓存身份或完整包内容。 */
export async function catalogData(
  env: Env,
  day: string,
  windowStart: string
): Promise<CatalogData> {
  const current = await revision(env);
  let cache = caches.get(env.DB);
  if (!cache) {
    cache = {};
    caches.set(env.DB, cache);
  }
  const now = Date.now();
  if (cache.value?.revision === current && cache.value.day === day && now < cache.value.expiresAt)
    return cache.value.data;
  if (cache.loading?.revision === current && cache.loading.day === day)
    return cache.loading.promise;
  const state = cache;
  const generation = {};
  const loading: LoadingCatalog = {
    revision: current,
    day,
    promise: (async () => {
      const data = await load(env, day, windowStart);
      // 多条读取期间发生发布或下架时拒绝混合数据，下次请求可安全重试。
      if ((await revision(env)) !== current)
        fail(503, "INTERNAL_ERROR", "插件目录正在更新，请重试");
      if (state.generation === generation)
        state.value = { revision: current, day, expiresAt: now + MAX_AGE_MS, data };
      return data;
    })(),
  };
  state.generation = generation;
  state.loading = loading;
  try {
    return await loading.promise;
  } finally {
    if (state.loading === loading) state.loading = undefined;
  }
}
