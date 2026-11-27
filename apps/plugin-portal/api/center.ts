import { isPluginCategory } from "@tau/plugins/package";
import { distributionPackageKind } from "@tau/plugins/template";
import {
  normalizeCenterHost,
  normalizeCenterQuery,
  evaluateCenterCompatibility,
  pluginSearchTerms,
  type CenterVersion,
  type CenterRelease,
  type CenterCatalogEntry,
  type CenterCatalogQuery,
  type CenterHost,
  type CenterCompatibility,
  type CenterPlatform,
  type CenterStatusItem,
  type PluginManifestI18n,
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
import {
  catalogData,
  columns,
  CURRENT_PACKAGE,
  platformWhere,
  compare,
  type Metadata,
  type CatalogData,
} from "./catalog-data";
import { downloadPublishedRelease, type ReleaseRow } from "./releases";
import { portablePlatformEnabled } from "./portable-review";

interface Position {
  rank: number;
  time: string;
  id: string;
}
const strings = (value: string): string[] => JSON.parse(value);
function parseI18n(value: string | null | undefined): PluginManifestI18n | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    return Object.keys(parsed).length ? (parsed as PluginManifestI18n) : undefined;
  } catch {
    return undefined;
  }
}
function parseLocales(value: string | null | undefined): readonly string[] | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return undefined;
    const list = parsed.filter(
      (item): item is string => typeof item === "string" && item.length > 0
    );
    return list.length ? list : undefined;
  } catch {
    return undefined;
  }
}
const matchesCatalogQuery = (row: Metadata, q: string) =>
  !q ||
  pluginSearchTerms({
    pluginId: row.plugin_id,
    name: row.name,
    description: row.description,
    keywords: strings(row.keywords),
    i18n: parseI18n(row.i18n_json),
  })
    .join("\n")
    .toLowerCase()
    .includes(q);
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

function* entries(
  env: Env,
  query: ReturnType<typeof normalizeCenterQuery>,
  after: Position | null,
  data: CatalogData
) {
  const candidates = [];
  for (const [id, group] of data.versions) {
    const versions = group.filter(
      row =>
        row.current_package &&
        (query.platform === "all" ||
          (JSON.parse(row.target_platforms) as string[]).includes(query.platform))
    );
    if (!versions.length) continue;
    const time = versions.reduce(
      (latest, row) => (row.published_at > latest ? row.published_at : latest),
      ""
    );
    const total = data.totals.get(id) ?? 0,
      recent = data.recent.get(id) ?? 0;
    const rank =
      query.sort === "downloadsTotal" ? total : query.sort === "downloads7d" ? recent : 0;
    if (
      after &&
      !(
        rank < after.rank ||
        (rank === after.rank && (time < after.time || (time === after.time && id > after.id)))
      )
    )
      continue;
    candidates.push({ id, versions, time, total, recent, rank });
  }
  candidates.sort(
    (a, b) =>
      b.rank - a.rank ||
      (a.time < b.time ? 1 : a.time > b.time ? -1 : 0) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
  for (const candidate of candidates) {
    const { versions, id } = candidate;
    const latest = versions[0];
    if (!matchesCatalogQuery(latest, query.q)) continue;
    const compatible = query.host
      ? versions.find(row => compatibility(row, env, query.host).status === "compatible")
      : undefined;
    const i18n = parseI18n(latest.i18n_json);
    const locales = parseLocales(latest.locales_json);
    const item: CenterCatalogEntry = {
      pluginId: id,
      name: latest.name,
      description: latest.description,
      categories: strings(latest.categories).filter(isPluginCategory),
      keywords: strings(latest.keywords),
      ...(i18n ? { i18n } : {}),
      ...(locales ? { locales } : {}),
      publisher: { login: latest.login, avatarUrl: latest.avatar_url },
      repository: latest.repository,
      downloadsTotal: candidate.total,
      downloads7d: candidate.recent,
      likes: data.likes.get(id) ?? 0,
      latest: version(latest, env),
      compatible: compatible ? version(compatible, env) : null,
      compatibility: compatibility(compatible ?? latest, env, query.host),
    };
    yield { item, position: { rank: candidate.rank, time: candidate.time, id } };
  }
}
function facets(data: CatalogData, query: ReturnType<typeof normalizeCenterQuery>) {
  const platformCounts: Record<CenterPlatform, number> = { all: 0, desktop: 0, android: 0, ios: 0 };
  const categoryCounts: Partial<Record<import("@tau/plugins/package").PluginCategory, number>> = {};
  for (const group of data.versions.values()) {
    const versions = group.filter(row => row.current_package);
    for (const platform of ["all", "desktop", "android", "ios"] as const) {
      const latest = versions.find(
        row => platform === "all" || Object.hasOwn(JSON.parse(row.targets_json), platform)
      );
      if (!latest || !matchesCatalogQuery(latest, query.q)) continue;
      const categories = strings(latest.categories).filter(isPluginCategory);
      if (!query.category || categories.includes(query.category)) platformCounts[platform]++;
      if (platform === query.platform)
        for (const category of categories)
          categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
    }
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
  const data = await catalogData(env, day, windowStart);
  const items: CenterCatalogEntry[] = [];
  let last: Position | null = null,
    hasMore = false;
  for (const value of entries(env, query, after, data)) {
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
    ...(query.cursor ? { categoryCounts: null, platformCounts: null } : facets(data, query)),
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
