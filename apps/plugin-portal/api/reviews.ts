import type { PackageContent, ReviewDecision, ReviewDetails, ReviewRecord } from "../contracts";
import { body, fail, isReviewer, json, type Env } from "./platform";
import { submissionAccess } from "./submissions";
import { readyUpload } from "./uploads";
import { getRelease, publishRelease, releaseDto } from "./releases";

interface ReviewRow {
  id: string;
  reviewed_revision: number;
  package_upload_id: string;
  sha256: string;
  manifest_json: string;
  repository: string;
  source_commit: string;
  reviewer_id: string;
  login: string;
  avatar_url: string;
  decision: ReviewDecision;
  comment: string;
  created_at: string;
}
const reviewDto = (row: ReviewRow): ReviewRecord => ({
  id: row.id,
  revision: row.reviewed_revision,
  packageUploadId: row.package_upload_id,
  sha256: row.sha256,
  manifest: JSON.parse(row.manifest_json),
  repository: row.repository,
  commit: row.source_commit,
  reviewer: { id: row.reviewer_id, login: row.login, avatarUrl: row.avatar_url },
  decision: row.decision,
  comment: row.comment,
  createdAt: row.created_at,
});
async function details(env: Env, id: string): Promise<ReviewDetails> {
  const rows = await env.DB.prepare(
    "SELECT r.*,p.login,p.avatar_url FROM submission_reviews r JOIN publishers p ON p.id=r.reviewer_id WHERE submission_id=? ORDER BY r.reviewed_revision DESC LIMIT 50"
  )
    .bind(id)
    .all<ReviewRow>();
  const release = await getRelease(env, id);
  return {
    reviews: rows.results.map(reviewDto),
    release: release ? releaseDto(release, env) : null,
  };
}
export async function reviewRoute(
  request: Request,
  env: Env,
  owner: string,
  path: string
): Promise<Response | null> {
  const match = /^\/v1\/submissions\/([\w-]+)\/(review|reviews|publish|package)$/.exec(path);
  if (!match) return null;
  const row = await submissionAccess(env, owner, match[1]);
  if (match[2] === "reviews" && request.method === "GET") return json(await details(env, row.id));
  if (match[2] === "package" && request.method === "GET") {
    if (!row.package_upload_id || !row.content_json) fail(404, "NOT_FOUND", "未关联插件包");
    const upload = await readyUpload(env, row.publisher_id, row.package_upload_id);
    const object = upload.object_key ? await env.PENDING.get(upload.object_key) : null;
    if (!object) fail(404, "NOT_FOUND", "插件包不存在");
    const manifest = (JSON.parse(row.content_json) as PackageContent).manifest;
    return new Response(await object.arrayBuffer(), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${manifest.id}-${manifest.version}.zip"`,
      },
    });
  }
  if (request.method !== "POST") return null;
  if (!isReviewer(env, owner)) fail(403, "FORBIDDEN", "只有审核者可以作出审核决定或发布");
  if (match[2] === "publish") {
    const release = await getRelease(env, row.id);
    if (row.status !== "approved" || !release)
      fail(409, "SUBMISSION_LOCKED", "只允许重试已批准的版本");
    await publishRelease(env, release);
    return json(await details(env, row.id));
  }
  if (match[2] !== "review") return null;
  const input = await body(request);
  if (
    !Number.isInteger(input.revision) ||
    typeof input.decision !== "string" ||
    !["approve", "request_changes", "reject"].includes(input.decision) ||
    typeof input.comment !== "string" ||
    input.comment.length > 4000
  )
    fail(400, "INVALID_INPUT", "审核参数无效");
  const decision = input.decision as ReviewDecision,
    comment = input.comment.trim();
  if (decision !== "approve" && !comment)
    fail(400, "INVALID_INPUT", "要求修改或拒绝时必须填写原因");
  const previous = await env.DB.prepare(
    "SELECT * FROM submission_reviews WHERE submission_id=? AND reviewed_revision=?"
  )
    .bind(row.id, input.revision)
    .first<ReviewRow>();
  if (previous) {
    if (
      previous.reviewer_id !== owner ||
      previous.decision !== decision ||
      previous.comment !== comment
    )
      fail(409, "REVISION_CONFLICT", "该修订已经有审核决定，请刷新");
    return json(await details(env, row.id));
  }
  if (row.status !== "pending_review" || row.revision !== input.revision)
    fail(409, "REVISION_CONFLICT", "提交状态或修订已变化，请刷新后重新审核");
  if (!row.package_upload_id || !row.content_json || !row.source_commit)
    fail(409, "UPLOAD_NOT_READY", "缺少可审核的包或源码快照");
  const upload = await readyUpload(env, row.publisher_id, row.package_upload_id);
  if (!upload.sha256) fail(409, "UPLOAD_NOT_READY", "产物缺少摘要");
  const manifest = (JSON.parse(row.content_json) as PackageContent).manifest;
  const id = crypto.randomUUID(),
    time = new Date().toISOString();
  const status = { approve: "approved", request_changes: "changes_requested", reject: "rejected" }[
    decision
  ];
  const commands = [
    env.DB.prepare(
      "INSERT INTO submission_reviews(id,submission_id,reviewed_revision,package_upload_id,sha256,manifest_json,repository,source_commit,reviewer_id,decision,comment,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? FROM submissions WHERE id=? AND status='pending_review' AND revision=?"
    ).bind(
      id,
      row.id,
      row.revision,
      row.package_upload_id,
      upload.sha256,
      JSON.stringify(manifest),
      row.repository,
      row.source_commit,
      owner,
      decision,
      comment,
      time,
      row.id,
      row.revision
    ),
    env.DB.prepare(
      "UPDATE submissions SET status=?,revision=revision+1,updated_at=? WHERE id=? AND status='pending_review' AND revision=? AND EXISTS(SELECT 1 FROM submission_reviews WHERE id=?)"
    ).bind(status, time, row.id, row.revision, id),
  ];
  if (decision === "approve")
    commands.push(
      env.DB.prepare(
        "INSERT INTO releases(id,plugin_id,version,submission_id,package_upload_id,publisher_id,object_key,sha256,size,content_json,repository,source_commit,state,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,'pending',? WHERE EXISTS(SELECT 1 FROM submission_reviews WHERE id=?)"
      ).bind(
        id,
        manifest.id,
        manifest.version,
        row.id,
        row.package_upload_id,
        row.publisher_id,
        `${manifest.id}/${manifest.version}/${upload.sha256}.zip`,
        upload.sha256,
        upload.size,
        row.content_json,
        row.repository,
        row.source_commit,
        time,
        id
      )
    );
  const result = await env.DB.batch(commands);
  if (!result[0].meta.changes) fail(409, "REVISION_CONFLICT", "该修订已被其他请求处理，请刷新");
  if (decision === "approve") {
    const release = await getRelease(env, row.id);
    if (release) await publishRelease(env, release);
  }
  return json(await details(env, row.id));
}
