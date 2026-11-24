import { assertPortablePublication } from "./portable-review";
import { comparePluginVersions, isPluginCategory } from "@tau/plugins/package";
import type {
  Catalog,
  CatalogEntry,
  PluginCategory,
  CatalogVersion,
  PackageContent,
  PublicRelease,
  Release,
  ReleasePage,
} from "../contracts";
import { fail, json, sha256, VISIBLE_PLUGIN, type Env, type BackgroundTasks } from "./platform";
import { countDownload, downloadWindow, pluginStatistics } from "./download-statistics";
import { catalogData, type CatalogData } from "./catalog-data";
import { purgeUploads } from "./uploads";
import { requiresSystemReview } from "../contracts/execution";

export interface ReleaseRow {
  format_version?: number;
  system_reviewed?: number;
  revoked_at?: string | null;
  id: string;
  plugin_id: string;
  version: string;
  submission_id: string;
  package_upload_id: string;
  publisher_id: string;
  object_key: string;
  sha256: string;
  size: number;
  content_json: string;
  repository: string;
  source_commit: string;
  state: Release["state"];
  error: string | null;
  published_at: string | null;
}
const desktopRelease = (alias: string) =>
  `${alias}.format_version <> 3 AND COALESCE(json_extract(${alias}.content_json,'$.manifest.platform'),'desktop')='desktop'`;
export const releaseDto = (row: ReleaseRow, env: Env): Release => ({
  systemReviewed: row.system_reviewed === 1,
  revokedAt: row.revoked_at ?? null,
  id: row.id,
  pluginId: row.plugin_id,
  version: row.version,
  state: row.state,
  sha256: row.sha256,
  size: row.size,
  error: row.error,
  publishedAt: row.published_at,
  downloadUrl:
    row.state === "published" && !row.revoked_at
      ? `${env.API_ORIGIN}/${JSON.parse(row.content_json).manifest.platform === "portable" ? "v2" : "v1"}/releases/${row.id}/download`
      : null,
});
export async function getRelease(env: Env, submissionId: string) {
  return env.DB.prepare("SELECT * FROM releases WHERE submission_id=?")
    .bind(submissionId)
    .first<ReleaseRow>();
}
/** 提交的原始包：待审对象在发布后被回收，此时改读正式桶里摘要一致的副本。 */
export async function submittedPackage(
  env: Env,
  upload: { id: string; object_key: string | null; sha256: string | null }
) {
  const pending = upload.object_key ? await env.PENDING.get(upload.object_key) : null;
  if (pending || !upload.sha256) return pending;
  const release = await env.DB.prepare(
    "SELECT object_key FROM releases WHERE package_upload_id=? AND sha256=? AND state='published'"
  )
    .bind(upload.id, upload.sha256)
    .first<{ object_key: string }>();
  return release ? env.RELEASES.get(release.object_key) : null;
}

export async function publishRelease(env: Env, row: ReleaseRow): Promise<void> {
  const manifest = (JSON.parse(row.content_json) as PackageContent).manifest;
  assertPortablePublication(env, manifest);
  if (row.revoked_at) fail(409, "SUBMISSION_LOCKED", "该版本已撤回，不能重新发布");
  if (
    requiresSystemReview((JSON.parse(row.content_json) as PackageContent).manifest) &&
    row.system_reviewed !== 1
  )
    fail(409, "SUBMISSION_LOCKED", "后台插件尚未完成系统能力审核");
  const attempt = crypto.randomUUID();
  const claim = await env.DB.prepare(
    "UPDATE releases SET state='publishing',attempt_id=?,lease_until=?,error=NULL WHERE id=? AND revoked_at IS NULL AND (state IN ('pending','failed') OR (state='publishing' AND lease_until<?))"
  )
    .bind(attempt, Date.now() + 120000, row.id, Date.now())
    .run();
  if (!claim.meta.changes) return;
  try {
    const upload = await env.DB.prepare(
      "SELECT object_key FROM uploads WHERE id=? AND publisher_id=? AND status='ready' AND sha256=?"
    )
      .bind(row.package_upload_id, row.publisher_id, row.sha256)
      .first<{ object_key: string }>();
    if (!upload) throw new Error("已批准产物记录不可用");
    const object = await env.PENDING.get(upload.object_key);
    if (!object) throw new Error("已批准的ZIP文件不存在");
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (bytes.length !== row.size || (await sha256(bytes)) !== row.sha256)
      throw new Error("ZIP摘要与批准记录不一致，拒绝发布");
    await env.RELEASES.put(row.object_key, bytes, {
      httpMetadata: { contentType: "application/zip" },
    });
    const published = await env.DB.prepare(
      "UPDATE releases SET state='published',published_at=?,error=NULL,lease_until=NULL WHERE id=? AND attempt_id=? AND state='publishing' AND revoked_at IS NULL"
    )
      .bind(new Date().toISOString(), row.id, attempt)
      .run();
    // 正式桶已有校验过的副本，待审对象即时回收；失败由每日清理兜底。
    if (published.meta.changes)
      await purgeUploads(env, [{ id: row.package_upload_id, object_key: upload.object_key }]).catch(
        error => console.error("plugin_pending_purge_failed", error)
      );
  } catch (error) {
    const known =
      error instanceof Error &&
      [
        "已批准产物记录不可用",
        "已批准的ZIP文件不存在",
        "ZIP摘要与批准记录不一致，拒绝发布",
      ].includes(error.message);
    await env.DB.prepare(
      "UPDATE releases SET state='failed',error=?,lease_until=NULL WHERE id=? AND attempt_id=? AND state='publishing'"
    )
      .bind(known ? (error as Error).message : "发布存储暂时不可用，请重试", row.id, attempt)
      .run();
  }
}

interface CatalogRow {
  id: string;
  plugin_id: string;
  version: string;
  name: string;
  description: string;
  categories: string;
  keywords: string;
  min_app_version: string;
  repository: string;
  size: number;
  sha256: string;
  published_at: string;
  login: string;
  avatar_url: string;
}
/** 列存 JSON 数组文本；异常值按空处理，不让单条脏数据拖垮目录。 */
function parseList(text: string): string[] {
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}
const searchText = (row: {
  plugin_id: string;
  name: string;
  description: string;
  keywords: string;
}) =>
  [row.plugin_id, row.name, row.description, ...parseList(row.keywords)].join("\n").toLowerCase();
const releaseCategories = (row: { categories: string }) =>
  parseList(row.categories).filter(isPluginCategory);

/** 分类计数与目录同口径：取每个插件最高已发布版本的分类，并受 q 约束。 */
function categoryCounts(versions: Map<string, CatalogRow[]>, query: string) {
  const counts: Partial<Record<PluginCategory, number>> = {};
  for (const group of versions.values()) {
    const row = group[0];
    if (query && !searchText(row).includes(query)) continue;
    for (const category of releaseCategories(row)) counts[category] = (counts[category] ?? 0) + 1;
  }
  return counts;
}

function legacyVersions(data: CatalogData): Map<string, CatalogRow[]> {
  const versions = new Map<string, CatalogRow[]>();
  for (const [id, group] of data.versions) {
    const desktop = group.filter(
      row =>
        row.format_version !== 3 &&
        (!row.distribution_platform || row.distribution_platform === "desktop")
    );
    if (desktop.length) versions.set(id, desktop);
  }
  return versions;
}

const catalogVersion = (row: CatalogRow, env: Env): CatalogVersion => ({
  releaseId: row.id,
  version: row.version,
  minAppVersion: row.min_app_version,
  publishedAt: row.published_at,
  size: row.size,
  sha256: row.sha256,
  downloadUrl: `${env.API_ORIGIN}/v1/releases/${row.id}/download`,
});

async function catalog(env: Env, params: URLSearchParams): Promise<Catalog> {
  const appVersion = params.get("appVersion") ?? "";
  try {
    comparePluginVersions(appVersion, appVersion);
  } catch {
    fail(400, "INVALID_INPUT", "appVersion必须是有效的客户端版本号", { appVersion: "版本号无效" });
  }
  const query = (params.get("q") ?? "").trim().toLowerCase();
  if (query.length > 200) fail(400, "INVALID_INPUT", "搜索词过长");
  const category = params.get("category") ?? "";
  if (category && !isPluginCategory(category)) fail(400, "INVALID_INPUT", "分类无效");
  const sort = params.get("sort") ?? "downloads7d";
  if (!["downloads7d", "downloadsTotal", "updated"].includes(sort))
    fail(400, "INVALID_INPUT", "排序无效");
  const limit = Number(params.get("limit") ?? 30);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    fail(400, "INVALID_INPUT", "分页大小无效");
  const { day, windowStart } = downloadWindow();
  let after: { rank: number; time: string; id: string } | null = null;
  const cursor = params.get("cursor");
  if (cursor) {
    try {
      if (cursor.length > 4096) throw new Error();
      const decoded = JSON.parse(
        new TextDecoder().decode(Uint8Array.from(atob(cursor), c => c.charCodeAt(0)))
      );
      if (
        decoded.sort !== sort ||
        decoded.q !== query ||
        (decoded.category ?? "") !== category ||
        decoded.version !== appVersion ||
        decoded.day !== day ||
        !Number.isSafeInteger(decoded.rank) ||
        decoded.rank < 0 ||
        typeof decoded.time !== "string" ||
        typeof decoded.id !== "string"
      )
        throw new Error();
      after = decoded;
    } catch {
      fail(400, "INVALID_INPUT", "分页游标无效或已跨日，请刷新列表");
    }
  }
  const data = await catalogData(env, day, windowStart);
  const versions = legacyVersions(data);
  const ranked = [];
  for (const [id, group] of versions) {
    // 保留 v1 的任一历史版本候选筛选与最高版本最终匹配语义。
    if (
      query &&
      !group.some(row =>
        [id, row.name, row.description, row.keywords].join("\n").toLowerCase().includes(query)
      )
    )
      continue;
    if (category && !group.some(row => releaseCategories(row).includes(category as PluginCategory)))
      continue;
    const total = data.totals.get(id) ?? 0,
      recent = data.recent.get(id) ?? 0;
    const rank = sort === "downloadsTotal" ? total : sort === "downloads7d" ? recent : 0;
    const time = group.reduce(
      (latest, row) => (row.published_at > latest ? row.published_at : latest),
      ""
    );
    if (
      after &&
      !(
        rank < after.rank ||
        (rank === after.rank && (time < after.time || (time === after.time && id > after.id)))
      )
    )
      continue;
    ranked.push({ plugin_id: id, time, rank, total, recent });
  }
  ranked.sort(
    (a, b) =>
      b.rank - a.rank ||
      (a.time < b.time ? 1 : a.time > b.time ? -1 : 0) ||
      (a.plugin_id < b.plugin_id ? -1 : a.plugin_id > b.plugin_id ? 1 : 0)
  );
  const page = ranked.slice(0, limit);
  const last = page.at(-1);
  const nextCursor =
    ranked.length > limit && last
      ? btoa(
          String.fromCharCode(
            ...new TextEncoder().encode(
              JSON.stringify({
                rank: last.rank,
                time: last.time,
                id: last.plugin_id,
                sort,
                q: query,
                category,
                version: appVersion,
                day,
              })
            )
          )
        )
      : null;
  const counts = cursor ? null : categoryCounts(versions, query);
  const items: CatalogEntry[] = [];
  for (const candidate of page) {
    const list = versions.get(candidate.plugin_id);
    if (!list?.length) continue;
    list.sort((a, b) => comparePluginVersions(b.version, a.version));
    const latest = list[0];
    if (query && !searchText(latest).includes(query)) continue;
    const categories = releaseCategories(latest);
    if (category && !categories.includes(category as PluginCategory)) continue;
    const compatible = list.find(
      row => comparePluginVersions(appVersion, row.min_app_version) >= 0
    );
    items.push({
      pluginId: latest.plugin_id,
      downloadsTotal: candidate.total,
      downloads7d: candidate.recent,
      likes: data.likes.get(candidate.plugin_id) ?? 0,
      name: latest.name,
      description: latest.description,
      publisher: { login: latest.login, avatarUrl: latest.avatar_url },
      repository: latest.repository,
      categories,
      keywords: parseList(latest.keywords),
      latest: catalogVersion(latest, env),
      compatible: compatible ? catalogVersion(compatible, env) : null,
    });
  }
  return { items, nextCursor, windowStart, categoryCounts: counts };
}

export async function publicReleaseRoute(
  request: Request,
  env: Env,
  path: string,
  context?: BackgroundTasks
): Promise<Response | null> {
  if (request.method !== "GET") return null;
  const stats = /^\/v1\/plugins\/([\w.-]+)\/stats$/.exec(path);
  if (stats) return json(await pluginStatistics(env, stats[1]));
  if (path === "/v1/catalog") return json(await catalog(env, new URL(request.url).searchParams));
  if (path === "/v1/releases") {
    const params = new URL(request.url).searchParams,
      plugin = params.get("pluginId"),
      cursor = params.get("cursor");
    let after: { time: string; id: string } | null = null;
    if (cursor) {
      try {
        after = JSON.parse(atob(cursor));
        if (!after || typeof after.id !== "string" || typeof after.time !== "string")
          throw new Error();
      } catch {
        fail(400, "INVALID_INPUT", "版本游标无效");
      }
    }
    const rows = await env.DB.prepare(
      `SELECT r.* FROM releases r WHERE r.state='published' AND ${VISIBLE_PLUGIN} AND ${desktopRelease("r")} AND (? IS NULL OR r.plugin_id=?) AND (? IS NULL OR r.published_at<? OR (r.published_at=? AND r.id<?)) ORDER BY r.published_at DESC,r.id DESC LIMIT 21`
    )
      .bind(
        plugin,
        plugin,
        after?.time ?? null,
        after?.time ?? null,
        after?.time ?? null,
        after?.id ?? null
      )
      .all<ReleaseRow>();
    const last = rows.results[19];
    return json<ReleasePage>({
      items: rows.results.slice(0, 20).map(row => ({
        ...releaseDto(row, env),
        manifest: (JSON.parse(row.content_json) as PackageContent).manifest,
      })),
      nextCursor:
        rows.results.length > 20
          ? btoa(JSON.stringify({ time: last.published_at, id: last.id }))
          : null,
    });
  }
  const match = /^\/v1\/releases\/([\w-]+)(\/download)?$/.exec(path);
  if (!match) return null;
  const row = await env.DB.prepare(
    `SELECT r.*,p.login,p.avatar_url FROM releases r JOIN publishers p ON p.id=r.publisher_id WHERE r.id=? AND r.state='published' AND ${VISIBLE_PLUGIN} AND ${desktopRelease("r")}`
  )
    .bind(match[1])
    .first<ReleaseRow & { login: string; avatar_url: string }>();
  if (!row) fail(404, "NOT_FOUND", "该版本尚未发布或已下架");
  if (!match[2])
    return json<PublicRelease>({
      ...releaseDto(row, env),
      content: JSON.parse(row.content_json),
      repository: row.repository,
      commit: row.source_commit,
      publisher: { login: row.login, avatarUrl: row.avatar_url },
    });
  return downloadPublishedRelease(request, env, row, context);
}

export async function downloadPublishedRelease(
  request: Request,
  env: Env,
  row: ReleaseRow,
  context?: BackgroundTasks
) {
  const object = await env.RELEASES.get(row.object_key);
  if (!object) fail(503, "SERVICE_UNAVAILABLE", "发布文件暂不可用");
  const bytes = await object.arrayBuffer();
  if (bytes.byteLength !== row.size || (await sha256(new Uint8Array(bytes))) !== row.sha256)
    fail(503, "SERVICE_UNAVAILABLE", "发布文件校验失败");
  const available = await env.DB.prepare(
    `SELECT r.id FROM releases r WHERE r.id=? AND r.state='published' AND ${VISIBLE_PLUGIN}`
  )
    .bind(row.id)
    .first();
  if (!available) fail(404, "NOT_FOUND", "该版本已撤回或插件已禁用");
  const counting = countDownload(request, env, row);
  if (context) context.waitUntil(counting);
  else await counting;
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${row.plugin_id}-${row.version}.zip"`,
      "X-Content-SHA256": row.sha256,
    },
  });
}
