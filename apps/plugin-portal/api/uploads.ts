import { LIMITS, type Upload, type UploadKind, type UploadTicket } from "../contracts";
import { body, fail, HttpError, json, readLimited, sha256, type Env } from "./platform";
import { imageMime, inspectPackage } from "./package";

interface UploadRow {
  id: string;
  publisher_id: string;
  kind: UploadKind;
  status: Upload["status"];
  file_name: string;
  size: number;
  object_key: string | null;
  sha256: string | null;
  manifest_json: string | null;
  error_json: string | null;
  created_at: string;
}
export const uploadDto = (row: UploadRow): Upload => ({
  id: row.id,
  kind: row.kind,
  status: row.status,
  fileName: row.file_name,
  size: row.size,
  sha256: row.sha256,
  manifest: row.manifest_json ? JSON.parse(row.manifest_json) : null,
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
export async function readyUpload(
  env: Env,
  owner: string,
  id: string,
  kind: UploadKind
): Promise<UploadRow> {
  const row = await getUpload(env, owner, id);
  if (row.status !== "ready" || row.kind !== kind)
    fail(409, "UPLOAD_NOT_READY", "请先完成对应文件上传和校验");
  return row;
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
      !["package", "icon", "screenshot"].includes(String(input.kind)) ||
      typeof input.fileName !== "string" ||
      !input.fileName.trim() ||
      input.fileName.length > 200 ||
      typeof input.size !== "number" ||
      !Number.isInteger(input.size) ||
      input.size <= 0
    )
      fail(400, "INVALID_INPUT", "上传参数无效");
    if (input.size > (input.kind === "package" ? LIMITS.zipBytes : LIMITS.imageBytes))
      fail(413, "UPLOAD_TOO_LARGE", "文件超过上传限制");
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM uploads WHERE publisher_id=? AND created_at>?"
    )
      .bind(owner, new Date(Date.now() - 86400000).toISOString())
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= 100) fail(409, "CONFLICT", "今日上传次数已达上限");
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO uploads(id,publisher_id,kind,status,file_name,size,created_at) VALUES (?,?,?,'awaiting_upload',?,?,?)"
    )
      .bind(id, owner, input.kind, input.fileName, input.size, new Date().toISOString())
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
  if (match[2] && request.method === "GET") {
    if (row.status !== "ready" || row.kind === "package" || !row.object_key)
      fail(404, "NOT_FOUND", "图片不可用");
    const object = await env.PENDING.get(row.object_key);
    if (!object) fail(404, "NOT_FOUND", "图片不存在");
    return new Response(await object.arrayBuffer(), {
      headers: {
        "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (match[2] && request.method === "PUT") {
    if (Date.parse(row.created_at) < Date.now() - 3600000)
      fail(409, "CONFLICT", "上传地址已过期，请重新申请");
    const claim = await env.DB.prepare(
      "UPDATE uploads SET status='checking',processing_at=? WHERE id=? AND publisher_id=? AND status='awaiting_upload'"
    )
      .bind(Date.now(), row.id, owner)
      .run();
    if (!claim.meta.changes) fail(409, "CONFLICT", "上传正在处理或已经完成，请查询状态");
    const objectKey = `${owner}/${row.id}`;
    try {
      const bytes = await readLimited(request, row.size);
      if (bytes.length !== row.size) fail(400, "INVALID_INPUT", "文件大小与上传申请不一致");
      const manifest = row.kind === "package" ? await inspectPackage(bytes) : null;
      const mime = row.kind === "package" ? "application/zip" : imageMime(bytes);
      const hash = await sha256(bytes);
      await env.PENDING.put(objectKey, bytes, { httpMetadata: { contentType: mime } });
      const complete = await env.DB.prepare(
        "UPDATE uploads SET status='ready',object_key=?,sha256=?,manifest_json=? WHERE id=? AND status='checking'"
      )
        .bind(objectKey, hash, manifest ? JSON.stringify(manifest) : null, row.id)
        .run();
      if (!complete.meta.changes) {
        await env.PENDING.delete(objectKey);
        fail(409, "CONFLICT", "上传处理已过期，请重新上传");
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
