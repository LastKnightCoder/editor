import { assertPortablePublication, readPlatformEvidence } from "./portable-review";
import type { PackageContent, ReviewDecision, ReviewDetails, ReviewRecord } from "../contracts";
import { requiresSystemReview } from "../contracts/execution";
import { body, fail, isReviewer, json, type Env } from "./platform";
import { submissionAccess, type SubmissionRow } from "./submissions";
import { getUpload, readyUpload } from "./uploads";
import { getRelease, publishRelease, releaseDto, submittedPackage } from "./releases";

interface ReviewRow {
  platform_evidence_json?: string | null;
  system_reviewed?: number;
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
  ...(row.platform_evidence_json
    ? { platformEvidence: JSON.parse(row.platform_evidence_json) }
    : {}),
  systemReviewed: row.system_reviewed === 1,
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
  const match = /^\/v1\/submissions\/([\w-]+)\/(review|reviews|publish|package|revoke)$/.exec(path);
  if (!match) return null;
  const row = await submissionAccess(env, owner, match[1]);
  if (match[2] === "reviews" && request.method === "GET") return json(await details(env, row.id));
  if (match[2] === "package" && request.method === "GET") {
    if (!row.package_upload_id || !row.content_json) fail(404, "NOT_FOUND", "未关联插件包");
    const upload = await getUpload(env, row.publisher_id, row.package_upload_id);
    const object = await submittedPackage(env, upload);
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
  if (match[2] === "revoke") {
    const input = await body(request);
    if (
      typeof input.reason !== "string" ||
      !input.reason.trim() ||
      input.reason.length > 4000 ||
      typeof input.clientRequestId !== "string" ||
      !/^[\w-]{16,80}$/.test(input.clientRequestId)
    )
      fail(400, "INVALID_INPUT", "撤回需要原因和有效的请求标识");
    const release = await getRelease(env, row.id);
    if (!release) fail(409, "SUBMISSION_LOCKED", "该提交尚无可撤回版本");
    const reason = input.reason.trim();
    const previous = await env.DB.prepare(
      "SELECT release_id,reason FROM release_revocations WHERE reviewer_id=? AND client_request_id=?"
    )
      .bind(owner, input.clientRequestId)
      .first<{ release_id: string; reason: string }>();
    if (previous) {
      if (previous.release_id !== release.id || previous.reason !== reason)
        fail(409, "REVISION_CONFLICT", "请求标识已被其他撤回操作使用");
      return json(await details(env, row.id));
    }
    if (release.revoked_at) fail(409, "SUBMISSION_LOCKED", "该版本已经撤回");
    const id = crypto.randomUUID(),
      time = new Date().toISOString();
    const result = await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO release_revocations(id,release_id,reviewer_id,client_request_id,reason,created_at) SELECT ?,?,?,?,?,? FROM releases WHERE id=? AND revoked_at IS NULL"
      ).bind(id, release.id, owner, input.clientRequestId, reason, time, release.id),
      env.DB.prepare(
        "UPDATE releases SET revoked_at=?,revoked_reason=? WHERE id=? AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM release_revocations WHERE id=?)"
      ).bind(time, reason, release.id, id),
    ]);
    if (!result[0].meta.changes) {
      const repeated = await env.DB.prepare(
        "SELECT release_id,reason FROM release_revocations WHERE reviewer_id=? AND client_request_id=?"
      )
        .bind(owner, input.clientRequestId)
        .first<{ release_id: string; reason: string }>();
      if (repeated?.release_id !== release.id || repeated.reason !== reason)
        fail(409, "REVISION_CONFLICT", "该版本已经被其他请求撤回");
    }
    return json(await details(env, row.id));
  }
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
    input.comment.length > 4000 ||
    (input.systemReviewConfirmed !== undefined && typeof input.systemReviewConfirmed !== "boolean")
  )
    fail(400, "INVALID_INPUT", "审核参数无效");
  const decision = input.decision as ReviewDecision,
    comment = input.comment.trim();
  if (decision !== "approve" && !comment)
    fail(400, "INVALID_INPUT", "要求修改或拒绝时必须填写原因");
  if (!row.content_json) fail(409, "UPLOAD_NOT_READY", "缺少可审核的包资料");
  const manifest = (JSON.parse(row.content_json) as PackageContent).manifest;
  const evidence = readPlatformEvidence(manifest, input.platformEvidence, decision === "approve");
  const previous = await env.DB.prepare(
    "SELECT * FROM submission_reviews WHERE submission_id=? AND reviewed_revision=?"
  )
    .bind(row.id, input.revision)
    .first<ReviewRow>();
  if (previous) {
    if (
      previous.reviewer_id !== owner ||
      previous.decision !== decision ||
      previous.comment !== comment ||
      (previous.platform_evidence_json ?? null) !== (evidence ? JSON.stringify(evidence) : null) ||
      (previous.system_reviewed === 1 && input.systemReviewConfirmed !== true)
    )
      fail(409, "REVISION_CONFLICT", "该修订已经有审核决定，请刷新");
    return json(await details(env, row.id));
  }
  return json(
    await decideSubmission(
      env,
      row,
      owner,
      input.revision as number,
      decision,
      comment,
      input.systemReviewConfirmed === true,
      evidence ?? undefined
    )
  );
}

/** 网页审核与 CI 自动批准共用：写入审核记录、更新提交状态，批准时生成并发布 Release。 */
export async function decideSubmission(
  env: Env,
  row: SubmissionRow,
  owner: string,
  revision: number,
  decision: ReviewDecision,
  comment: string,
  systemReviewConfirmed = false,
  platformEvidence?: import("../contracts").PlatformReviewEvidence
): Promise<ReviewDetails> {
  if (row.status !== "pending_review" || row.revision !== revision)
    fail(409, "REVISION_CONFLICT", "提交状态或修订已变化，请刷新后重新审核");
  if (!row.package_upload_id || !row.content_json || !row.source_commit)
    fail(409, "UPLOAD_NOT_READY", "缺少可审核的包或源码快照");
  const upload = await readyUpload(env, row.publisher_id, row.package_upload_id);
  if (!upload.sha256) fail(409, "UPLOAD_NOT_READY", "产物缺少摘要");
  const manifest = (JSON.parse(row.content_json) as PackageContent).manifest;
  const evidence = readPlatformEvidence(manifest, platformEvidence, decision === "approve");
  if (decision === "approve") assertPortablePublication(env, manifest);
  const systemReviewed = requiresSystemReview(manifest) && decision === "approve";
  if (systemReviewed && !systemReviewConfirmed)
    fail(400, "INVALID_INPUT", "批准后台插件前必须明确完成系统能力审核");
  const id = crypto.randomUUID(),
    time = new Date().toISOString();
  const status = { approve: "approved", request_changes: "changes_requested", reject: "rejected" }[
    decision
  ];
  const commands = [
    env.DB.prepare(
      "INSERT INTO submission_reviews(id,submission_id,reviewed_revision,package_upload_id,sha256,manifest_json,repository,source_commit,reviewer_id,decision,comment,created_at,system_reviewed,platform_evidence_json) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? FROM submissions WHERE id=? AND status='pending_review' AND revision=?"
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
      systemReviewed ? 1 : 0,
      evidence ? JSON.stringify(evidence) : null,
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
        "INSERT INTO releases(id,plugin_id,version,submission_id,package_upload_id,publisher_id,object_key,sha256,size,content_json,repository,source_commit,name,description,min_app_version,categories,keywords,state,created_at,system_reviewed,platform_evidence_json) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?,? WHERE EXISTS(SELECT 1 FROM submission_reviews WHERE id=?)"
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
        manifest.name,
        manifest.description,
        manifest.formatVersion === 3 ? "" : manifest.minAppVersion,
        JSON.stringify(manifest.categories ?? []),
        JSON.stringify(manifest.keywords ?? []),
        time,
        systemReviewed ? 1 : 0,
        evidence ? JSON.stringify(evidence) : null,
        id
      )
    );
  const result = await env.DB.batch(commands);
  if (!result[0].meta.changes) fail(409, "REVISION_CONFLICT", "该修订已被其他请求处理，请刷新");
  if (decision === "approve") {
    const release = await getRelease(env, row.id);
    if (release) await publishRelease(env, release);
  }
  return details(env, row.id);
}
