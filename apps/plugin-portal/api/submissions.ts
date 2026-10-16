import {
  emptyListing,
  LIMITS,
  type Listing,
  type Submission,
  type SubmissionPage,
} from "../contracts";
import { body, fail, json, type Env } from "./platform";
import { readyUpload } from "./uploads";
import { verifyRepository } from "./github";

interface SubmissionRow {
  id: string;
  revision: number;
  status: Submission["status"];
  package_upload_id: string | null;
  manifest_json: string | null;
  listing_json: string;
  repository_id: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
}
const dto = (row: SubmissionRow): Submission => ({
  id: row.id,
  revision: row.revision,
  status: row.status,
  packageUploadId: row.package_upload_id,
  manifest: row.manifest_json ? JSON.parse(row.manifest_json) : null,
  listing: JSON.parse(row.listing_json),
  repositoryId: row.repository_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  submittedAt: row.submitted_at,
});

export function validateListing(input: unknown, complete = false): Listing {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail(400, "INVALID_INPUT", "插件资料无效");
  const value = input as Record<string, unknown>;
  const limits = {
    summary: LIMITS.summary,
    description: LIMITS.description,
    changelog: LIMITS.changelog,
    repository: 300,
    commit: 40,
    supportUrl: 2000,
  };
  for (const [field, limit] of Object.entries(limits)) {
    if (
      typeof value[field] !== "string" ||
      (value[field] as string).length > limit ||
      (complete && !(value[field] as string).trim())
    )
      fail(400, "INVALID_INPUT", `${field} 内容缺失或超过长度限制`);
  }
  if (
    (value.iconUploadId !== null && typeof value.iconUploadId !== "string") ||
    !Array.isArray(value.screenshotUploadIds) ||
    value.screenshotUploadIds.length > LIMITS.screenshots ||
    value.screenshotUploadIds.some(x => typeof x !== "string") ||
    new Set(value.screenshotUploadIds).size !== value.screenshotUploadIds.length
  )
    fail(400, "INVALID_INPUT", "图片引用无效");
  if (complete) {
    if (!value.iconUploadId) fail(400, "INVALID_INPUT", "请上传插件图标");
    if (
      !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(String(value.repository)) ||
      !/^[a-f0-9]{40}$/i.test(String(value.commit))
    )
      fail(400, "INVALID_INPUT", "仓库地址或完整 commit SHA 无效");
    try {
      const url = new URL(String(value.supportUrl));
      if (url.protocol !== "https:" || url.username || url.password) throw new Error();
    } catch {
      fail(400, "INVALID_INPUT", "反馈链接必须为 HTTPS 地址");
    }
  }
  return Object.fromEntries(
    [...Object.keys(limits), "iconUploadId", "screenshotUploadIds"].map(key => [key, value[key]])
  ) as unknown as Listing;
}
async function getSubmission(env: Env, owner: string, id: string): Promise<Submission> {
  const row = await env.DB.prepare("SELECT * FROM submissions WHERE id=? AND publisher_id=?")
    .bind(id, owner)
    .first<SubmissionRow>();
  if (!row) fail(404, "NOT_FOUND", "找不到提交记录");
  return dto(row);
}
async function validateImages(env: Env, owner: string, listing: Listing): Promise<void> {
  if (listing.iconUploadId) await readyUpload(env, owner, listing.iconUploadId, "icon");
  for (const id of listing.screenshotUploadIds) await readyUpload(env, owner, id, "screenshot");
}
export async function submissionRoute(
  request: Request,
  env: Env,
  owner: string,
  token: () => Promise<string>,
  path: string
): Promise<Response | null> {
  if (path === "/v1/submissions" && request.method === "POST") {
    const input = await body(request);
    if (
      typeof input.clientRequestId !== "string" ||
      !/^[a-f0-9-]{36}$/i.test(input.clientRequestId)
    )
      fail(400, "INVALID_INPUT", "需要 clientRequestId UUID");
    const existing = await env.DB.prepare(
      "SELECT * FROM submissions WHERE publisher_id=? AND client_request_id=?"
    )
      .bind(owner, input.clientRequestId)
      .first<SubmissionRow>();
    if (existing) return json(dto(existing));
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM submissions WHERE publisher_id=?")
      .bind(owner)
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= 100) fail(409, "CONFLICT", "提交记录已达首期上限，请联系维护者");
    const id = crypto.randomUUID();
    const time = new Date().toISOString();
    await env.DB.prepare(
      "INSERT OR IGNORE INTO submissions(id,publisher_id,client_request_id,listing_json,created_at,updated_at) VALUES (?,?,?,?,?,?)"
    )
      .bind(id, owner, input.clientRequestId, JSON.stringify(emptyListing()), time, time)
      .run();
    const row = await env.DB.prepare(
      "SELECT * FROM submissions WHERE publisher_id=? AND client_request_id=?"
    )
      .bind(owner, input.clientRequestId)
      .first<SubmissionRow>();
    if (!row) fail(503, "SERVICE_UNAVAILABLE", "草稿创建失败，请使用同一请求编号重试");
    return json(dto(row), 201);
  }
  if (path === "/v1/submissions" && request.method === "GET") {
    const cursor = new URL(request.url).searchParams.get("cursor");
    let after: { time: string; id: string } | null = null;
    if (cursor) {
      try {
        after = JSON.parse(atob(cursor));
        if (
          !after ||
          typeof after.time !== "string" ||
          !Number.isFinite(Date.parse(after.time)) ||
          typeof after.id !== "string" ||
          !/^[a-f0-9-]{36}$/i.test(after.id)
        )
          throw new Error();
      } catch {
        fail(400, "INVALID_INPUT", "分页游标无效");
      }
    }
    const rows = await env.DB.prepare(
      "SELECT * FROM submissions WHERE publisher_id=? AND (? IS NULL OR created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT 21"
    )
      .bind(owner, after?.time ?? null, after?.time ?? null, after?.time ?? null, after?.id ?? null)
      .all<SubmissionRow>();
    const last = rows.results[19];
    return json<SubmissionPage>({
      items: rows.results.slice(0, 20).map(dto),
      nextCursor:
        rows.results.length > 20
          ? btoa(JSON.stringify({ time: last.created_at, id: last.id }))
          : null,
    });
  }
  const match = /^\/v1\/submissions\/([\w-]+)(\/submit)?$/.exec(path);
  if (!match) return null;
  const current = await getSubmission(env, owner, match[1]);
  if (!match[2] && request.method === "GET") return json(current);
  if (!match[2] && request.method === "PATCH") {
    const input = await body(request);
    if (current.status !== "draft" || input.revision !== current.revision)
      fail(409, "CONFLICT", "记录已更新或已提交，请重新读取");
    const listing = validateListing(input.listing);
    if (input.packageUploadId !== null && typeof input.packageUploadId !== "string")
      fail(400, "INVALID_INPUT", "插件包引用无效");
    const upload = input.packageUploadId
      ? await readyUpload(env, owner, input.packageUploadId as string, "package")
      : null;
    await validateImages(env, owner, listing);
    const result = await env.DB.prepare(
      "UPDATE submissions SET listing_json=?,package_upload_id=?,manifest_json=?,revision=revision+1,updated_at=? WHERE id=? AND publisher_id=? AND status='draft' AND revision=?"
    )
      .bind(
        JSON.stringify(listing),
        input.packageUploadId,
        upload?.manifest_json ?? null,
        new Date().toISOString(),
        current.id,
        owner,
        current.revision
      )
      .run();
    if (!result.meta.changes) fail(409, "CONFLICT", "记录已更新，请重新读取");
    return json(await getSubmission(env, owner, current.id));
  }
  if (match[2] && request.method === "POST") {
    const input = await body(request);
    if (current.status === "pending_review") return json(current);
    if (input.revision !== current.revision) fail(409, "CONFLICT", "记录已更新，请重新读取");
    const listing = validateListing(current.listing, true);
    if (!current.packageUploadId || !current.manifest)
      fail(400, "INVALID_INPUT", "请先上传插件包并保存");
    await readyUpload(env, owner, current.packageUploadId, "package");
    await validateImages(env, owner, listing);
    const repositoryId = await verifyRepository(await token(), listing.repository, listing.commit);
    const time = new Date().toISOString();
    try {
      const results = await env.DB.batch([
        env.DB.prepare(
          `INSERT OR IGNORE INTO plugins(id,publisher_id,repository_id)
          SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM submissions WHERE id=? AND publisher_id=? AND status='draft' AND revision=?)`
        ).bind(current.manifest.id, owner, repositoryId, current.id, owner, current.revision),
        env.DB.prepare(
          `UPDATE submissions SET status='pending_review',plugin_id=?,plugin_version=?,repository_id=?,submitted_at=?,updated_at=?,revision=revision+1
          WHERE id=? AND publisher_id=? AND revision=? AND status='draft'
          AND EXISTS(SELECT 1 FROM plugins WHERE id=? AND publisher_id=? AND repository_id=?)`
        ).bind(
          current.manifest.id,
          current.manifest.version,
          repositoryId,
          time,
          time,
          current.id,
          owner,
          current.revision,
          current.manifest.id,
          owner,
          repositoryId
        ),
      ]);
      if (!results[1].meta.changes) {
        const latest = await getSubmission(env, owner, current.id);
        if (latest.status === "pending_review") return json(latest);
        fail(409, "CONFLICT", "记录已变化，或插件 ID 已绑定其他作者/仓库");
      }
    } catch (error) {
      if (String(error).includes("UNIQUE constraint failed"))
        fail(409, "CONFLICT", "该插件版本已有待审核提交");
      throw error;
    }
    return json(await getSubmission(env, owner, current.id));
  }
  return null;
}
