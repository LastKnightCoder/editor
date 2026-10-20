import { LIMITS, type Upload, type UploadTicket } from "../contracts";
import { body, fail, HttpError, json, readLimited, sha256, type Env } from "./platform";
import { inspectPackage } from "./package";

interface UploadRow {
  id: string;
  publisher_id: string;
  status: Upload["status"];
  file_name: string;
  size: number;
  object_key: string | null;
  sha256: string | null;
  content_json: string | null;
  error_json: string | null;
  created_at: string;
}
export const uploadDto = (row: UploadRow): Upload => ({
  id: row.id,
  status: row.status,
  fileName: row.file_name,
  size: row.size,
  sha256: row.sha256,
  content: row.content_json ? JSON.parse(row.content_json) : null,
  error: row.error_json ? JSON.parse(row.error_json) : null,
  createdAt: row.created_at,
});
export async function getUpload(env: Env, owner: string, id: string): Promise<UploadRow> {
  await env.DB.prepare(
    "UPDATE uploads SET status='invalid',error_json=? WHERE id=? AND publisher_id=? AND status='checking' AND processing_at<?"
  )
    .bind(
      JSON.stringify({ code: "UPLOAD_NOT_READY", message: "上传处理超时，请重新上传" }),
      id,
      owner,
      Date.now() - 300000
    )
    .run();
  const row = await env.DB.prepare("SELECT * FROM uploads WHERE id=? AND publisher_id=?")
    .bind(id, owner)
    .first<UploadRow>();
  if (!row) fail(404, "NOT_FOUND", "找不到上传记录");
  return row;
}
export async function readyUpload(env: Env, owner: string, id: string): Promise<UploadRow> {
  const row = await getUpload(env, owner, id);
  if (row.status !== "ready") fail(409, "UPLOAD_NOT_READY", "请先完成对应文件上传和校验");
  return row;
}
const PURGED_ERROR = JSON.stringify({
  code: "UPLOAD_EXPIRED",
  message: "插件包已回收，请重新上传",
});
/**
 * 回收一批上传的待审对象。先置 invalid 再删对象、最后清引用：任一步失败都停在
 * 「invalid 且仍有 object_key」的中间态，既不能再挂到新提交，也会被下一次每日清理补扫。
 */
export async function purgeUploads(env: Env, uploads: { id: string; object_key: string }[]) {
  if (!uploads.length) return;
  const invalidate = env.DB.prepare(
    "UPDATE uploads SET status='invalid',error_json=? WHERE id=? AND status='ready'"
  );
  await env.DB.batch(uploads.map(upload => invalidate.bind(PURGED_ERROR, upload.id)));
  await env.PENDING.delete(uploads.map(upload => upload.object_key));
  const detach = env.DB.prepare(
    "UPDATE uploads SET object_key=NULL WHERE id=? AND status='invalid'"
  );
  await env.DB.batch(uploads.map(upload => detach.bind(upload.id)));
}
const UPLOAD_RETENTION_MS = 7 * 86400000;
export const PURGE_PAGE = 100;
const PURGE_PAGES_PER_RUN = 10;
/**
 * 每日清理待审桶：补扫上次回收留下的中间态；已发布的包正式桶已有副本；其余只保留仍被草稿、
 * 待审、整改中或待发布提交引用的，已拒绝、换包遗留、上传后未提交的包超过保留期即回收。
 * 按页批量处理，一页失败即停，留给次日。
 */
export async function purgeStaleUploads(env: Env) {
  const before = new Date(Date.now() - UPLOAD_RETENTION_MS).toISOString();
  for (let page = 0; page < PURGE_PAGES_PER_RUN; page++) {
    const rows = await env.DB.prepare(
      `SELECT id,object_key FROM uploads u WHERE object_key IS NOT NULL AND (status='invalid'
        OR (status='ready' AND created_at<? AND (
          EXISTS(SELECT 1 FROM releases r WHERE r.package_upload_id=u.id AND r.state='published')
          OR NOT EXISTS(SELECT 1 FROM submissions s WHERE s.package_upload_id=u.id AND s.status IN ('draft','pending_review','changes_requested','approved')))))
        LIMIT ?`
    )
      .bind(before, PURGE_PAGE)
      .all<{ id: string; object_key: string }>();
    if (!rows.results.length) break;
    try {
      await purgeUploads(env, rows.results);
    } catch (error) {
      console.error("plugin_pending_purge_failed", error);
      break;
    }
    if (rows.results.length < PURGE_PAGE) break;
  }
}
export async function uploadRoute(
  request: Request,
  env: Env,
  owner: string,
  path: string
): Promise<Response | null> {
  if (path === "/v1/uploads" && request.method === "POST") {
    const input = await body(request);
    if (
      typeof input.fileName !== "string" ||
      !input.fileName.trim() ||
      input.fileName.length > 200 ||
      typeof input.size !== "number" ||
      !Number.isInteger(input.size) ||
      input.size <= 0
    )
      fail(400, "INVALID_INPUT", "上传参数无效");
    if (input.size > LIMITS.zipBytes) fail(413, "UPLOAD_TOO_LARGE", "文件超过上传限制");
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM uploads WHERE publisher_id=? AND created_at>?"
    )
      .bind(owner, new Date(Date.now() - 86400000).toISOString())
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= 100) fail(409, "LIMIT_EXCEEDED", "今日上传次数已达上限，请明天再试");
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO uploads(id,publisher_id,status,file_name,size,created_at) VALUES (?,?,'awaiting_upload',?,?,?)"
    )
      .bind(id, owner, input.fileName, input.size, new Date().toISOString())
      .run();
    return json<UploadTicket>(
      {
        upload: uploadDto(await getUpload(env, owner, id)),
        uploadUrl: `${env.API_ORIGIN}/v1/uploads/${id}/content`,
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
      },
      201
    );
  }
  const match = /^\/v1\/uploads\/([\w-]+)(\/content)?$/.exec(path);
  if (!match) return null;
  const row = await getUpload(env, owner, match[1]);
  if (!match[2] && request.method === "GET") return json(uploadDto(row));
  if (match[2] && request.method === "PUT") {
    if (row.status !== "awaiting_upload")
      fail(409, "UPLOAD_STATE_CONFLICT", "上传正在处理或已经结束，请查询状态");
    if (Date.parse(row.created_at) < Date.now() - 3600000)
      fail(409, "UPLOAD_EXPIRED", "上传地址已过期，请重新选择文件并申请上传");
    const claim = await env.DB.prepare(
      "UPDATE uploads SET status='checking',processing_at=? WHERE id=? AND publisher_id=? AND status='awaiting_upload'"
    )
      .bind(Date.now(), row.id, owner)
      .run();
    if (!claim.meta.changes)
      fail(409, "UPLOAD_STATE_CONFLICT", "上传正在处理或已经结束，请查询状态");
    const objectKey = `${owner}/${row.id}`;
    try {
      const bytes = await readLimited(request, row.size);
      if (bytes.length !== row.size) fail(400, "INVALID_INPUT", "文件大小与上传申请不一致");
      const content = await inspectPackage(bytes);
      const hash = await sha256(bytes);
      await env.PENDING.put(objectKey, bytes, { httpMetadata: { contentType: "application/zip" } });
      const complete = await env.DB.prepare(
        "UPDATE uploads SET status='ready',object_key=?,sha256=?,content_json=? WHERE id=? AND status='checking'"
      )
        .bind(objectKey, hash, JSON.stringify(content), row.id)
        .run();
      if (!complete.meta.changes) {
        await env.PENDING.delete(objectKey);
        fail(409, "UPLOAD_EXPIRED", "上传处理已过期，请重新上传");
      }
      return json(uploadDto(await getUpload(env, owner, row.id)));
    } catch (error) {
      const issue =
        error instanceof HttpError
          ? error
          : new HttpError(503, "SERVICE_UNAVAILABLE", "上传处理失败，请重新上传");
      await env.DB.prepare(
        "UPDATE uploads SET status='invalid',error_json=? WHERE id=? AND status='checking'"
      )
        .bind(JSON.stringify({ code: issue.code, message: issue.message }), row.id)
        .run();
      throw issue;
    }
  }
  return null;
}
