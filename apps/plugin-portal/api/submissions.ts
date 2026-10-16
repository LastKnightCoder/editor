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
  const labels = {
    summary: "简介",
    description: "详细介绍",
    changelog: "更新说明",
    repository: "源码仓库",
    commit: "源码提交",
    supportUrl: "反馈链接",
  };
  const fields: Record<string, string> = {};
  for (const [field, limit] of Object.entries(limits)) {
    if (
      typeof value[field] !== "string" ||
      (value[field] as string).length > limit ||
      (complete && !(value[field] as string).trim())
    )
      fields[field] = `${labels[field as keyof typeof labels]}不能为空且不能超过 ${limit} 个字符`;
  }
  if (value.iconUploadId !== null && typeof value.iconUploadId !== "string")
    fields.iconUploadId = "图标引用无效，请重新上传";
  if (
    !Array.isArray(value.screenshotUploadIds) ||
    value.screenshotUploadIds.length > LIMITS.screenshots ||
    value.screenshotUploadIds.some(x => typeof x !== "string") ||
    new Set(value.screenshotUploadIds).size !== value.screenshotUploadIds.length
  )
    fields.screenshotUploadIds = "截图引用无效，最多支持五张且不能重复";
  if (complete) {
    if (!value.iconUploadId) fields.iconUploadId = "请上传插件图标";
    if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(String(value.repository)))
      fields.repository = "请填写 https://github.com/作者/仓库 格式的源码地址";
    if (!/^[a-f0-9]{40}$/i.test(String(value.commit)))
      fields.commit = "请填写完整的 40 位源码提交 SHA";
    try {
      const url = new URL(String(value.supportUrl));
      if (url.protocol !== "https:" || url.username || url.password) throw new Error();
    } catch {
      fields.supportUrl = "反馈链接必须为不包含用户名或密码的 HTTPS 地址";
    }
  }
  if (Object.keys(fields).length) fail(400, "INVALID_INPUT", Object.values(fields)[0], fields);
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
    if ((count?.n ?? 0) >= 100) fail(409, "LIMIT_EXCEEDED", "提交记录已达首期上限，请联系维护者");
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
    if (current.status !== "draft")
      fail(409, "SUBMISSION_LOCKED", "该记录已提交审核，请查看只读详情");
    if (input.revision !== current.revision)
      fail(409, "REVISION_CONFLICT", "草稿已在其他窗口更新，请读取最新版本后比较修改");
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
    if (!result.meta.changes) {
      const latest = await getSubmission(env, owner, current.id);
      if (latest.status !== "draft")
        fail(409, "SUBMISSION_LOCKED", "该记录已提交审核，请查看只读详情");
      fail(409, "REVISION_CONFLICT", "草稿已在其他窗口更新，请读取最新版本后比较修改");
    }
    return json(await getSubmission(env, owner, current.id));
  }
  if (match[2] && request.method === "POST") {
    const input = await body(request);
    if (current.status === "pending_review") return json(current);
    if (input.revision !== current.revision)
      fail(409, "REVISION_CONFLICT", "草稿已更新，请读取最新版本后重新确认提交");
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
        if (latest.revision !== current.revision)
          fail(409, "REVISION_CONFLICT", "草稿已更新，请读取最新版本后重新确认提交");
        fail(
          409,
          "PLUGIN_OWNERSHIP_CONFLICT",
          "插件 ID 已绑定其他作者或仓库，请更换 ID 或联系维护者"
        );
      }
    } catch (error) {
      if (String(error).includes("UNIQUE constraint failed"))
        fail(
          409,
          "VERSION_ALREADY_SUBMITTED",
          "该插件版本已有待审核提交，请在我的提交中查看已有记录"
        );
      throw error;
    }
    return json(await getSubmission(env, owner, current.id));
  }
  return null;
}
