import { comparePluginVersions, isPluginCategory } from "@tau/plugins/package";
import { distributionPackageKind } from "@tau/plugins/template";
import {
  normalizeCenterHost,
  normalizeCenterQuery,
  evaluateCenterCompatibility,
  type CenterVersion,
  type CenterRelease,
  type CenterCatalogEntry,
  type CenterCatalogQuery,
  type CenterHost,
  type CenterCompatibility,
  type CenterPlatform,
  type CenterStatusItem,
} from "@tau/plugins/center";
import {
  body,
  fail,
  json,
  sha256,
  VISIBLE_PLUGIN,
  type Env,
  type BackgroundTasks,
} from "./platform";
import { downloadWindow } from "./download-statistics";
import { downloadPublishedRelease, type ReleaseRow } from "./releases";
import { portablePlatformEnabled } from "./portable-review";

interface Metadata {
  id: string;
  plugin_id: string;
  version: string;
  format_version: 1 | 2 | 3;
  package_kind: "plugin" | "skills" | "template";
  distribution_platform: "desktop" | "portable";
  profile: "web-v1" | null;
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
interface Position {
  rank: number;
  time: string;
  id: string;
}
const skillShape = (alias: string) =>
  `(${alias}.format_version=1 AND json_extract(${alias}.content_json,'$.manifest.apiVersion')=1 AND json_type(${alias}.content_json,'$.manifest.skills')='array' AND json_array_length(${alias}.content_json,'$.manifest.skills')>0 AND ${["main", "template", "backend", "format", "profile", "styles"].map(field => `json_type(${alias}.content_json,'$.manifest.${field}') IS NULL`).join(" AND ")})`;
// 包类型来自实际结构，作者自填的 packageKind 不参与分发裁决。
const CURRENT_PACKAGE = `(r.format_version<>1 OR (${skillShape("r")} AND (json_extract(r.content_json,'$.manifest.platform')='desktop' OR (json_extract(r.content_json,'$.manifest.platform')='portable' AND json_type(r.content_json,'$.manifest.targets')='object'))) OR (json_extract(r.content_json,'$.manifest.platform')='desktop' AND json_type(r.content_json,'$.manifest.template')='object' AND json_type(r.content_json,'$.manifest.main') IS NULL))`;
const columns = `r.id,r.plugin_id,r.version,r.format_version,r.profile,r.targets_json,r.published_at,r.size,r.sha256,r.name,r.description,r.categories,r.keywords,r.repository,p.login,p.avatar_url,json_extract(r.content_json,'$.manifest.platform') AS distribution_platform,CASE WHEN ${skillShape("r")} THEN 'skills' WHEN r.format_version=1 AND json_type(r.content_json,'$.manifest.template')='object' THEN 'template' ELSE 'plugin' END AS package_kind`;
const platformWhere =
  "(?='all' OR EXISTS(SELECT 1 FROM release_targets t WHERE t.release_id=r.id AND t.platform=?))";
const strings = (value: string): string[] => JSON.parse(value);
const compare = (a: Metadata, b: Metadata) =>
  comparePluginVersions(b.version, a.version) ||
  b.published_at.localeCompare(a.published_at) ||
  a.id.localeCompare(b.id);
const version = (row: Metadata, env: Env): CenterVersion => ({
  releaseId: row.id,
  version: row.version,
  formatVersion: row.format_version,
  packageKind: row.package_kind,
  apiVersion: 1,
  profile: row.profile,
  targets: Object.fromEntries(
    Object.entries(JSON.parse(row.targets_json) as Record<string, { minAppVersion: string }>).map(
      ([platform, target]) => [platform, { minAppVersion: target.minAppVersion }]
    )
  ),
  publishedAt: row.published_at,
  size: row.size,
  sha256: row.sha256,
  downloadUrl: `${env.API_ORIGIN}/v2/releases/${row.id}/download`,
});
function compatibility(row: Metadata, env: Env, host?: CenterHost): CenterCompatibility {
  if (host && host.platform !== "desktop" && row.distribution_platform !== "portable")
    return {
      status: "incompatible",
      reasons: [{ code: "PLATFORM_UNSUPPORTED", platform: host.platform }],
    };
  if (
    host &&
    row.distribution_platform === "portable" &&
    !portablePlatformEnabled(env, host.platform)
  )
    return {
      status: "incompatible",
      reasons: [{ code: "DISTRIBUTION_UNAVAILABLE" }],
    };
  return evaluateCenterCompatibility(version(row, env), host);
}

function validate<T>(fn: () => T): T {
  try {
    return fn();
  } catch {
    return fail(400, "INVALID_INPUT", "查询条件或宿主声明无效");
  }
}
function identifier(value: string) {
  if (!/^[\w.-]{1,128}$/.test(value)) fail(400, "INVALID_INPUT", "插件或版本标识无效");
  return value;
}
const encodeCursor = (value: unknown) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))));
function decodeCursor<T>(value: string | null, scope: string): T | null {
  if (!value) return null;
  return validate(() => {
    const decoded = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(atob(value), c => c.charCodeAt(0)))
    );
    if (
      decoded.scope !== scope ||
      !decoded.position ||
      typeof decoded.position !== "object" ||
      Array.isArray(decoded.position)
    )
      throw new Error();
    return decoded.position as T;
  });
}
async function release(env: Env, id: string): Promise<CenterRelease> {
  const row = await env.DB.prepare(
    `SELECT r.*,p.login,p.avatar_url FROM releases r JOIN publishers p ON p.id=r.publisher_id WHERE r.id=? AND r.state='published' AND ${VISIBLE_PLUGIN} AND ${CURRENT_PACKAGE}`
  )
    .bind(id)
    .first<ReleaseRow & Metadata>();
  if (!row) fail(404, "NOT_FOUND", "该版本尚未发布或已下架");
  const content: CenterRelease["content"] = JSON.parse(row.content_json);
  return {
    ...version(
      {
        ...row,
        package_kind: distributionPackageKind(content.manifest),
        distribution_platform: content.manifest.platform,
      },
      env
    ),
    pluginId: row.plugin_id,
    content,
    publisher: { login: row.login, avatarUrl: row.avatar_url },
    repository: row.repository,
    commit: row.source_commit,
    systemReviewed: row.system_reviewed === 1,
  };
}
async function metadata(env: Env, pluginId: string, platform: CenterPlatform = "all") {
  const rows = await env.DB.prepare(
    `SELECT ${columns} FROM releases r JOIN publishers p ON p.id=r.publisher_id WHERE r.plugin_id=? AND r.state='published' AND ${VISIBLE_PLUGIN} AND ${CURRENT_PACKAGE} AND ${platformWhere}`
  )
    .bind(pluginId, platform, platform)
    .all<Metadata>();
  return rows.results.sort(compare);
}

/** 按插件分批读轻量元数据，平台在 SQL 分页前过滤，不加载 README 或 ZIP。 */
async function* entries(
  env: Env,
  query: ReturnType<typeof normalizeCenterQuery>,
  after: Position | null,
  day: string,
  windowStart: string
) {
  let position = after;
  for (;;) {
    const rank =
      query.sort === "downloadsTotal" ? "total" : query.sort === "downloads7d" ? "recent" : "0";
    const page = await env.DB.prepare(
      `WITH candidates AS (
      SELECT r.plugin_id,MAX(r.published_at) AS time,COALESCE(t.downloads,0) AS total,COALESCE(d.downloads,0) AS recent
      FROM releases r LEFT JOIN plugin_download_totals t ON t.plugin_id=r.plugin_id
      LEFT JOIN (SELECT plugin_id,SUM(downloads) AS downloads FROM plugin_download_daily WHERE day>=? AND day<=? GROUP BY plugin_id) d ON d.plugin_id=r.plugin_id
      WHERE r.state='published' AND ${VISIBLE_PLUGIN} AND ${CURRENT_PACKAGE} AND ${platformWhere} GROUP BY r.plugin_id
    ), ranked AS (SELECT *,${rank} AS rank FROM candidates)
    SELECT * FROM ranked ${position ? "WHERE rank<? OR (rank=? AND (time<? OR (time=? AND plugin_id>?)))" : ""} ORDER BY rank DESC,time DESC,plugin_id ASC LIMIT 50`
    )
      .bind(
        windowStart,
        day,
        query.platform,
        query.platform,
        ...(position
          ? [position.rank, position.rank, position.time, position.time, position.id]
          : [])
      )
      .all<{ plugin_id: string; time: string; rank: number; total: number; recent: number }>();
    if (!page.results.length) return;
    const ids = page.results.map(item => item.plugin_id),
      marks = ids.map(() => "?").join(",");
    const [rows, likes] = await Promise.all([
      env.DB.prepare(
        `SELECT ${columns} FROM releases r JOIN publishers p ON p.id=r.publisher_id WHERE r.state='published' AND ${VISIBLE_PLUGIN} AND ${CURRENT_PACKAGE} AND ${platformWhere} AND r.plugin_id IN (${marks})`
      )
        .bind(query.platform, query.platform, ...ids)
        .all<Metadata>(),
      env.DB.prepare(
        `SELECT plugin_id,COUNT(*) AS n FROM plugin_likes WHERE plugin_id IN (${marks}) GROUP BY plugin_id`
      )
        .bind(...ids)
        .all<{ plugin_id: string; n: number }>(),
    ]);
    const likeMap = new Map(likes.results.map(item => [item.plugin_id, item.n]));
    for (const candidate of page.results) {
      position = { rank: candidate.rank, time: candidate.time, id: candidate.plugin_id };
      const versions = rows.results
        .filter(row => row.plugin_id === candidate.plugin_id)
        .sort(compare);
      const latest = versions[0];
      if (!latest) continue;
      if (
        ![latest.plugin_id, latest.name, latest.description, ...strings(latest.keywords)]
          .join("\n")
          .toLowerCase()
          .includes(query.q)
      )
        continue;
      const compatible = query.host
        ? versions.find(row => compatibility(row, env, query.host).status === "compatible")
        : undefined;
      const item: CenterCatalogEntry = {
        pluginId: latest.plugin_id,
        name: latest.name,
        description: latest.description,
        categories: strings(latest.categories).filter(isPluginCategory),
        keywords: strings(latest.keywords),
        publisher: { login: latest.login, avatarUrl: latest.avatar_url },
        repository: latest.repository,
        downloadsTotal: candidate.total,
        downloads7d: candidate.recent,
        likes: likeMap.get(latest.plugin_id) ?? 0,
        latest: version(latest, env),
        compatible: compatible ? version(compatible, env) : null,
        compatibility: compatibility(compatible ?? latest, env, query.host),
      };
      yield { item, position };
    }
    if (page.results.length < 50) return;
  }
}
async function facets(env: Env, query: ReturnType<typeof normalizeCenterQuery>) {
  const platformCounts: Record<CenterPlatform, number> = { all: 0, desktop: 0, android: 0, ios: 0 };
  const categoryCounts: Partial<Record<import("@tau/plugins/package").PluginCategory, number>> = {};
  let after = "";
  for (;;) {
    const page = await env.DB.prepare(
      `SELECT DISTINCT r.plugin_id FROM releases r WHERE r.state='published' AND ${VISIBLE_PLUGIN} AND ${CURRENT_PACKAGE} AND r.plugin_id>? ORDER BY r.plugin_id LIMIT 50`
    )
      .bind(after)
      .all<{ plugin_id: string }>();
    if (!page.results.length) break;
    const ids = page.results.map(item => item.plugin_id);
    const rows = await env.DB.prepare(
      `SELECT ${columns} FROM releases r JOIN publishers p ON p.id=r.publisher_id WHERE r.state='published' AND ${VISIBLE_PLUGIN} AND ${CURRENT_PACKAGE} AND r.plugin_id IN (${ids.map(() => "?").join(",")})`
    )
      .bind(...ids)
      .all<Metadata>();
    for (const id of ids) {
      const versions = rows.results.filter(row => row.plugin_id === id).sort(compare);
      for (const platform of ["all", "desktop", "android", "ios"] as const) {
        const latest = versions.find(
          row => platform === "all" || Object.hasOwn(JSON.parse(row.targets_json), platform)
        );
        if (
          !latest ||
          ![id, latest.name, latest.description, ...strings(latest.keywords)]
            .join("\n")
            .toLowerCase()
            .includes(query.q)
        )
          continue;
        const categories = strings(latest.categories).filter(isPluginCategory);
        if (!query.category || categories.includes(query.category)) platformCounts[platform]++;
        if (platform === query.platform)
          for (const category of categories)
            categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
      }
    }
    after = ids[ids.length - 1];
    if (ids.length < 50) break;
  }
  return { platformCounts, categoryCounts };
}

async function catalog(request: Request, env: Env) {
  const input = await body(request);

  const query = validate(() => normalizeCenterQuery(input as unknown as CenterCatalogQuery));
  const { day, windowStart } = downloadWindow();
  const scope = await sha256(JSON.stringify({ ...query, cursor: null, day }));
  const after = decodeCursor<Position>(query.cursor, scope);
  if (
    after &&
    (!Number.isSafeInteger(after.rank) ||
      after.rank < 0 ||
      typeof after.time !== "string" ||
      typeof after.id !== "string")
  )
    fail(400, "INVALID_INPUT", "目录游标无效");
  const items: CenterCatalogEntry[] = [];
  let last: Position | null = null,
    hasMore = false;
  for await (const value of entries(env, query, after, day, windowStart)) {
    if (query.category && !value.item.categories.includes(query.category)) continue;
    if (items.length < query.limit) {
      items.push(value.item);
      last = value.position;
    } else {
      hasMore = true;
      break;
    }
  }
  return json({
    items,
    nextCursor: hasMore && last ? encodeCursor({ scope, position: last }) : null,
    windowStart,
    ...(query.cursor ? { categoryCounts: null, platformCounts: null } : await facets(env, query)),
  });
}

export async function centerRoute(
  request: Request,
  env: Env,
  path: string,
  context?: BackgroundTasks
): Promise<Response | null> {
  if (!path.startsWith("/v2/")) return null;
  if (path === "/v2/catalog/query" && request.method === "POST") return catalog(request, env);
  if (path === "/v2/releases/status" && request.method === "POST") {
    const input = await body(request);

    if (
      !Array.isArray(input.releaseIds) ||
      input.releaseIds.length > 100 ||
      input.releaseIds.some(id => typeof id !== "string")
    )
      fail(400, "INVALID_INPUT", "每次最多查询 100 个版本");
    const ids = [...new Set((input.releaseIds as string[]).map(identifier))];
    const rows = ids.length
      ? (
          await env.DB.prepare(
            `SELECT r.id,r.revoked_at,r.revoked_reason,p.disabled_at,p.disabled_reason FROM releases r LEFT JOIN plugins p ON p.id=r.plugin_id WHERE r.id IN (${ids.map(() => "?").join(",")}) AND r.state='published'`
          )
            .bind(...ids)
            .all<{
              id: string;
              revoked_at: string | null;
              revoked_reason: string | null;
              disabled_at: string | null;
              disabled_reason: string | null;
            }>()
        ).results
      : [];
    const items: CenterStatusItem[] = ids.map(releaseId => {
      const row = rows.find(item => item.id === releaseId);
      return {
        releaseId,
        status: !row
          ? "not_found"
          : row.revoked_at
            ? "revoked"
            : row.disabled_at
              ? "disabled"
              : "available",
        reason: row?.revoked_reason ?? row?.disabled_reason ?? null,
      };
    });
    return json({ items });
  }
  const plugin = /^\/v2\/plugins\/([\w.-]+)\/(resolve|releases)$/.exec(path);
  if (plugin) {
    const pluginId = identifier(plugin[1]);
    if (plugin[2] === "resolve" && request.method === "POST") {
      const input = await body(request);

      const host = validate(() => normalizeCenterHost(input.host as CenterHost));
      if (
        input.releaseId !== undefined &&
        (typeof input.releaseId !== "string" || !input.releaseId)
      )
        fail(400, "INVALID_INPUT", "版本标识无效");
      const selectedId =
        input.releaseId === undefined ? null : identifier(input.releaseId as string);
      const candidates = (await metadata(env, pluginId)).filter(
        row => !selectedId || row.id === selectedId
      );
      const selected = candidates.find(
        row => compatibility(row, env, host).status === "compatible"
      );
      return json({
        release: selected ? await release(env, selected.id) : null,
        compatibility: selected
          ? compatibility(selected, env, host)
          : candidates.length
            ? compatibility(candidates[0], env, host)
            : { status: "incompatible", reasons: [{ code: "NO_RELEASE" }] },
      });
    }
    if (plugin[2] === "releases" && request.method === "GET") {
      const params = new URL(request.url).searchParams;
      const platform = validate(() =>
        normalizeCenterQuery({ platform: (params.get("platform") ?? "all") as CenterPlatform })
      ).platform;
      const scope = `versions:${pluginId}:${platform}`;
      const after = decodeCursor<{ id: string }>(params.get("cursor"), scope);
      const rows = await metadata(env, pluginId, platform);
      const offset = after ? rows.findIndex(row => row.id === after.id) + 1 : 0;
      if (after && !offset) fail(400, "INVALID_INPUT", "版本游标已失效，请刷新");
      const page = rows.slice(offset, offset + 20);
      return json({
        items: await Promise.all(page.map(row => release(env, row.id))),
        nextCursor:
          rows.length > offset + 20
            ? encodeCursor({ scope, position: { id: page[page.length - 1].id } })
            : null,
      });
    }
  }
  const match = /^\/v2\/releases\/([\w-]+)(\/download)?$/.exec(path);
  if (match && request.method === "GET") {
    identifier(match[1]);
    if (!match[2]) return json(await release(env, match[1]));
    const row = await env.DB.prepare(
      `SELECT r.* FROM releases r WHERE r.id=? AND r.state='published' AND ${VISIBLE_PLUGIN} AND ${CURRENT_PACKAGE}`
    )
      .bind(match[1])
      .first<ReleaseRow>();
    if (!row) fail(404, "NOT_FOUND", "该版本尚未发布或已下架");
    return downloadPublishedRelease(request, env, row, context);
  }
  return fail(404, "NOT_FOUND", "接口不存在");
}
