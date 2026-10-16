import type { PackageContent, Release } from "../contracts";
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

export async function publicReleaseRoute(
  request: Request,
  env: Env,
  path: string
): Promise<Response | null> {
  if (request.method !== "GET") return null;
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
  const row = await env.DB.prepare("SELECT * FROM releases WHERE id=? AND state='published'")
    .bind(match[1])
    .first<ReleaseRow>();
  if (!row) fail(404, "NOT_FOUND", "该版本尚未发布");
  if (!match[2]) return json({ ...releaseDto(row, env), content: JSON.parse(row.content_json) });
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
