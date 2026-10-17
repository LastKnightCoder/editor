import { comparePluginVersions } from "@tau/plugins/package";
import type {
  Catalog,
  CatalogEntry,
  CatalogVersion,
  PackageContent,
  PublicRelease,
  Release,
} from "../contracts";
import { fail, json, sha256, type Env } from "./platform";

export interface ReleaseRow {
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
export const releaseDto = (row: ReleaseRow, env: Env): Release => ({
  id: row.id,
  pluginId: row.plugin_id,
  version: row.version,
  state: row.state,
  sha256: row.sha256,
  size: row.size,
  error: row.error,
  publishedAt: row.published_at,
  downloadUrl:
    row.state === "published" ? `${env.API_ORIGIN}/v1/releases/${row.id}/download` : null,
});
export async function getRelease(env: Env, submissionId: string) {
  return env.DB.prepare("SELECT * FROM releases WHERE submission_id=?")
    .bind(submissionId)
    .first<ReleaseRow>();
}

export async function publishRelease(env: Env, row: ReleaseRow): Promise<void> {
  const attempt = crypto.randomUUID();
  const claim = await env.DB.prepare(
    "UPDATE releases SET state='publishing',attempt_id=?,lease_until=?,error=NULL WHERE id=? AND (state IN ('pending','failed') OR (state='publishing' AND lease_until<?))"
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
    await env.DB.prepare(
      "UPDATE releases SET state='published',published_at=?,error=NULL,lease_until=NULL WHERE id=? AND attempt_id=? AND state='publishing'"
    )
      .bind(new Date().toISOString(), row.id, attempt)
      .run();
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
  min_app_version: string;
  repository: string;
  size: number;
  sha256: string;
  published_at: string;
  login: string;
  avatar_url: string;
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
  const rows = await env.DB.prepare(
    "SELECT r.id,r.plugin_id,r.version,r.name,r.description,r.min_app_version,r.repository,r.size,r.sha256,r.published_at,p.login,p.avatar_url FROM releases r JOIN publishers p ON p.id=r.publisher_id WHERE r.state='published'"
  ).all<CatalogRow>();
  const versions = new Map<string, CatalogRow[]>();
  for (const row of rows.results)
    versions.set(row.plugin_id, [...(versions.get(row.plugin_id) ?? []), row]);
  const items: CatalogEntry[] = [];
  for (const list of versions.values()) {
    list.sort((a, b) => comparePluginVersions(b.version, a.version));
    const latest = list[0];
    const text = `${latest.plugin_id}\n${latest.name}\n${latest.description}`.toLowerCase();
    if (query && !text.includes(query)) continue;
    const compatible = list.find(
      row => comparePluginVersions(appVersion, row.min_app_version) >= 0
    );
    items.push({
      pluginId: latest.plugin_id,
      name: latest.name,
      description: latest.description,
      publisher: { login: latest.login, avatarUrl: latest.avatar_url },
      repository: latest.repository,
      latest: catalogVersion(latest, env),
      compatible: compatible ? catalogVersion(compatible, env) : null,
    });
  }
  items.sort((a, b) =>
    a.latest.publishedAt === b.latest.publishedAt
      ? a.pluginId.localeCompare(b.pluginId)
      : a.latest.publishedAt < b.latest.publishedAt
        ? 1
        : -1
  );
  return { items };
}

export async function publicReleaseRoute(
  request: Request,
  env: Env,
  path: string
): Promise<Response | null> {
  if (request.method !== "GET") return null;
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
      "SELECT * FROM releases WHERE state='published' AND (? IS NULL OR plugin_id=?) AND (? IS NULL OR published_at<? OR (published_at=? AND id<?)) ORDER BY published_at DESC,id DESC LIMIT 21"
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
    return json({
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
    "SELECT r.*,p.login,p.avatar_url FROM releases r JOIN publishers p ON p.id=r.publisher_id WHERE r.id=? AND r.state='published'"
  )
    .bind(match[1])
    .first<ReleaseRow & { login: string; avatar_url: string }>();
  if (!row) fail(404, "NOT_FOUND", "该版本尚未发布");
  if (!match[2])
    return json<PublicRelease>({
      ...releaseDto(row, env),
      content: JSON.parse(row.content_json),
      repository: row.repository,
      commit: row.source_commit,
      publisher: { login: row.login, avatarUrl: row.avatar_url },
    });
  const object = await env.RELEASES.get(row.object_key);
  if (!object) fail(503, "SERVICE_UNAVAILABLE", "发布文件暂不可用");
  return new Response(await object.arrayBuffer(), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${row.plugin_id}-${row.version}.zip"`,
      "X-Content-SHA256": row.sha256,
    },
  });
}
