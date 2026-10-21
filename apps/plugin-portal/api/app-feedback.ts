import {
  APP_FEEDBACK_LIMITS as LIMITS,
  type AppFeedbackAttachment,
  type AppFeedbackAttachmentKind,
  type AppFeedbackContext,
  type AppFeedbackDetail,
  type AppFeedbackKind,
  type AppFeedbackPage,
  type AppFeedbackReceipt,
  type AppFeedbackStatus,
  type AppFeedbackSummary,
} from "../contracts";
import { body, fail, isReviewer, json, readLimited, sha256, type Env } from "./platform";
import { boundary, nextCursor } from "./moderation";
import { visitorFor } from "./visitors";

// 全站每日写入 R2 的上限：超出即熔断，最坏情况下的存储与流量成本有界
const DAILY_BYTES_CAP = 1024 * 1024 * 1024;
const KINDS: AppFeedbackKind[] = ["bug", "idea", "other"];
const STATUSES: AppFeedbackStatus[] = ["new", "doing", "done", "ignored"];
const CONTEXT_KEYS: (keyof AppFeedbackContext)[] = [
  "appVersion",
  "platform",
  "osVersion",
  "arch",
  "page",
  "theme",
  "locale",
];
const PREFIX = "/v1/moderation/app-feedback";

interface FeedbackRow {
  id: string;
  visitor_id: string;
  client_request_id: string;
  kind: AppFeedbackKind;
  message: string;
  contact: string | null;
  context_json: string | null;
  status: AppFeedbackStatus;
  note: string;
  revision: number;
  created_at: string;
  updated_at: string;
  image_count: number;
  log_count: number;
}
interface AttachmentRow {
  id: string;
  feedback_id: string;
  kind: AppFeedbackAttachmentKind;
  object_key: string;
  mime: string;
  size: number;
}
interface Upload {
  kind: AppFeedbackAttachmentKind;
  mime: string;
  bytes: Uint8Array;
}

const ROW_SELECT = `SELECT f.*,
  (SELECT COUNT(*) FROM app_feedback_attachments a WHERE a.feedback_id=f.id AND a.kind='image') AS image_count,
  (SELECT COUNT(*) FROM app_feedback_attachments a WHERE a.feedback_id=f.id AND a.kind<>'image') AS log_count
  FROM app_feedback f`;

function parseContext(text: string | null): AppFeedbackContext | null {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
const summaryDto = (row: FeedbackRow): AppFeedbackSummary => {
  const context = parseContext(row.context_json);
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    message: row.message,
    visitorId: row.visitor_id,
    appVersion: context?.appVersion ?? null,
    platform: context?.platform ?? null,
    imageCount: row.image_count,
    hasLogs: row.log_count > 0,
    createdAt: row.created_at,
  };
};

/** 只认文件头魔数，不信任客户端声明的类型；SVG 等可执行格式一律拒收。 */
export function imageMime(bytes: Uint8Array): string | null {
  const head = (length: number, offset = 0) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (bytes[0] === 0x89 && head(3, 1) === "PNG") return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (head(4) === "RIFF" && head(4, 8) === "WEBP") return "image/webp";
  return null;
}
const isGzip = (bytes: Uint8Array) => bytes[0] === 0x1f && bytes[1] === 0x8b;

function readContext(value: unknown): AppFeedbackContext | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value))
    fail(400, "INVALID_INPUT", "环境信息格式无效");
  const context: AppFeedbackContext = {};
  for (const [key, field] of Object.entries(value)) {
    if (!CONTEXT_KEYS.includes(key as keyof AppFeedbackContext) || typeof field !== "string")
      fail(400, "INVALID_INPUT", "环境信息格式无效");
    context[key as keyof AppFeedbackContext] = field.slice(0, 100);
  }
  return context;
}

async function readSubmission(request: Request) {
  const type = request.headers.get("Content-Type") ?? "";
  if (!type.startsWith("multipart/form-data")) fail(400, "INVALID_INPUT", "反馈需要以表单上传");
  const declared = Number(request.headers.get("Content-Length"));
  if (declared > LIMITS.requestBytes) fail(413, "UPLOAD_TOO_LARGE", "反馈附件超过大小限制");
  const raw = await readLimited(request, LIMITS.requestBytes);
  let form: FormData;
  try {
    form = await new Request("http://feedback.local", {
      method: "POST",
      headers: { "Content-Type": type },
      body: raw,
    }).formData();
  } catch {
    return fail(400, "INVALID_INPUT", "反馈表单无法解析");
  }
  let meta: Record<string, unknown>;
  try {
    meta = JSON.parse(String(form.get("meta") ?? ""));
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) throw new Error();
  } catch {
    return fail(400, "INVALID_INPUT", "反馈内容格式无效");
  }
  const message = typeof meta.message === "string" ? meta.message.trim() : "";
  if (!message || message.length > LIMITS.message)
    fail(400, "INVALID_INPUT", `反馈内容需要1至${LIMITS.message}字`);
  if (!KINDS.includes(meta.kind as AppFeedbackKind)) fail(400, "INVALID_INPUT", "反馈类型无效");
  const contact =
    typeof meta.contact === "string" && meta.contact.trim() ? meta.contact.trim() : null;
  if (contact && contact.length > LIMITS.contact) fail(400, "INVALID_INPUT", "联系方式过长");
  if (typeof meta.clientRequestId !== "string" || !/^[\w-]{16,80}$/.test(meta.clientRequestId))
    fail(400, "INVALID_INPUT", "反馈请求ID无效");

  const uploads: Upload[] = [];
  const images = form.getAll("image");
  if (images.length > LIMITS.images) fail(400, "INVALID_INPUT", `最多附带${LIMITS.images}张截图`);
  for (const image of images) {
    if (typeof image === "string") fail(400, "INVALID_INPUT", "截图格式无效");
    if (image.size > LIMITS.imageBytes) fail(413, "UPLOAD_TOO_LARGE", "单张截图超过大小限制");
    const bytes = new Uint8Array(await image.arrayBuffer());
    const mime = imageMime(bytes);
    if (!mime) fail(400, "INVALID_INPUT", "截图只支持 PNG、JPEG 或 WebP");
    uploads.push({ kind: "image", mime, bytes });
  }
  for (const kind of ["log", "perf"] as const) {
    const entries = form.getAll(kind);
    if (!entries.length) continue;
    const file = entries[0];
    if (entries.length > 1 || typeof file === "string")
      fail(400, "INVALID_INPUT", "日志附件格式无效");
    if (file.size > LIMITS.logBytes) fail(413, "UPLOAD_TOO_LARGE", "日志超过大小限制");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isGzip(bytes)) fail(400, "INVALID_INPUT", "日志需要 gzip 压缩");
    uploads.push({ kind, mime: "application/gzip", bytes });
  }
  return {
    kind: meta.kind as AppFeedbackKind,
    message,
    contact,
    context: readContext(meta.context),
    clientRequestId: meta.clientRequestId,
    uploads,
  };
}

const receipt = (row: { id: string; created_at: string }) =>
  json<AppFeedbackReceipt>({ id: row.id, createdAt: row.created_at });

async function reserveQuota(request: Request, env: Env, visitorId: string, bytes: number) {
  const now = new Date().toISOString();
  const day = now.slice(0, 10);
  const today = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM app_feedback WHERE visitor_id=? AND created_at>=?"
  )
    .bind(visitorId, day)
    .first<{ n: number }>();
  if ((today?.n ?? 0) >= LIMITS.perVisitorDaily)
    fail(429, "LIMIT_EXCEEDED", "今天已经发了不少反馈，请明天再试");
  if (!env.TOKEN_ENCRYPTION_KEY) fail(503, "SERVICE_UNAVAILABLE", "反馈服务暂不可用");
  const bucket = await sha256(
    `${env.TOKEN_ENCRYPTION_KEY}:feedback:${request.headers.get("CF-Connecting-IP") ?? "local"}:${day}`
  );
  const ip = await env.DB.prepare(
    "INSERT INTO app_feedback_ip_limits(bucket,day,count) VALUES(?,?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1 WHERE count<?"
  )
    .bind(bucket, day, LIMITS.perIpDaily)
    .run();
  if (!ip.meta.changes) fail(429, "LIMIT_EXCEEDED", "今天已经发了不少反馈，请明天再试");
  const budget = await env.DB.prepare(
    "INSERT INTO app_feedback_daily_bytes(day,bytes) SELECT ?,? WHERE ?<=? ON CONFLICT(day) DO UPDATE SET bytes=bytes+excluded.bytes WHERE bytes+excluded.bytes<=?"
  )
    .bind(day, bytes, bytes, DAILY_BYTES_CAP, DAILY_BYTES_CAP)
    .run();
  if (!budget.meta.changes) fail(429, "LIMIT_EXCEEDED", "今天的反馈额度已满，请明天再试");
  return now;
}

async function submit(request: Request, env: Env) {
  // 只接受桌面客户端：浏览器请求必带 Origin，门户网页没有反馈入口
  if (request.headers.has("Origin")) fail(403, "FORBIDDEN", "反馈只能从桌面客户端提交");
  if (request.headers.get("X-Tau-Visitor") !== "1") fail(403, "FORBIDDEN", "缺少匿名请求标识");
  const identity = await visitorFor(request, env);
  if (!identity || identity.revoked) fail(403, "FORBIDDEN", "匿名身份失效或已停用");
  const input = await readSubmission(request);
  const findPrevious = () =>
    env.DB.prepare("SELECT * FROM app_feedback WHERE visitor_id=? AND client_request_id=?")
      .bind(identity.id, input.clientRequestId)
      .first<FeedbackRow>();
  const replay = (row: FeedbackRow) => {
    if (row.message !== input.message) fail(409, "REVISION_CONFLICT", "请求ID已经用于另一条反馈");
    return receipt(row);
  };
  const previous = await findPrevious();
  if (previous) return replay(previous);

  const total = input.uploads.reduce((sum, upload) => sum + upload.bytes.length, 0);
  const now = await reserveQuota(request, env, identity.id, total);
  const id = crypto.randomUUID();
  const keys: string[] = [];
  try {
    const attachments = await Promise.all(
      input.uploads.map(async (upload, position) => {
        const ext = upload.kind === "image" ? upload.mime.slice(6) : `${upload.kind}.gz`;
        const key = `feedback/${now.slice(0, 7)}/${id}/${position}.${ext}`;
        keys.push(key);
        await env.FEEDBACK.put(key, upload.bytes, { httpMetadata: { contentType: upload.mime } });
        return { ...upload, key, position };
      })
    );
    // 额度与停用状态在插入语句里复核，并发请求也不能越过每日上限
    await env.DB.batch([
      env.DB.prepare(
        `INSERT OR IGNORE INTO app_feedback(id,visitor_id,client_request_id,kind,message,contact,context_json,created_at,updated_at)
        SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM app_feedback WHERE visitor_id=? AND created_at>=?)<?
        AND EXISTS(SELECT 1 FROM visitors WHERE id=? AND revoked=0)`
      ).bind(
        id,
        identity.id,
        input.clientRequestId,
        input.kind,
        input.message,
        input.contact,
        input.context ? JSON.stringify(input.context) : null,
        now,
        now,
        identity.id,
        now.slice(0, 10),
        LIMITS.perVisitorDaily,
        identity.id
      ),
      ...attachments.map(attachment =>
        env.DB.prepare(
          `INSERT INTO app_feedback_attachments(id,feedback_id,kind,object_key,mime,size,position)
          SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM app_feedback WHERE id=?)`
        ).bind(
          crypto.randomUUID(),
          id,
          attachment.kind,
          attachment.key,
          attachment.mime,
          attachment.bytes.length,
          attachment.position,
          id
        )
      ),
    ]);
  } catch (error) {
    await deleteObjects(env, keys);
    throw error;
  }
  const row = await findPrevious();
  if (row?.id === id) return receipt(row);
  await deleteObjects(env, keys);
  if (row) return replay(row);
  if ((await visitorFor(request, env))?.revoked) fail(403, "FORBIDDEN", "匿名身份已停用");
  return fail(429, "LIMIT_EXCEEDED", "今天已经发了不少反馈，请明天再试");
}

async function deleteObjects(env: Env, keys: string[]) {
  if (keys.length) await env.FEEDBACK.delete(keys).catch(() => undefined);
}

export async function appFeedbackRoute(request: Request, env: Env, path: string) {
  if (path !== "/v1/app-feedback") return null;
  if (request.method !== "POST") fail(404, "NOT_FOUND", "接口不存在");
  return submit(request, env);
}

async function list(env: Env, url: URL) {
  const status = url.searchParams.get("status") ?? "new";
  const kind = url.searchParams.get("kind") ?? "all";
  const visitor = url.searchParams.get("visitorId") ?? "";
  if (
    (status !== "all" && !STATUSES.includes(status as AppFeedbackStatus)) ||
    (kind !== "all" && !KINDS.includes(kind as AppFeedbackKind)) ||
    !/^[\w-]{0,80}$/.test(visitor)
  )
    fail(400, "INVALID_INPUT", "反馈筛选无效");
  const scope = JSON.stringify(["app-feedback", status, kind, visitor]);
  const after = boundary(url, scope);
  const filters = "(?='all' OR f.kind=?) AND (?='' OR f.visitor_id=?)";
  const rows = await env.DB.prepare(
    `${ROW_SELECT} WHERE ${filters} AND (?='all' OR f.status=?)
    ${after ? "AND (f.created_at<? OR (f.created_at=? AND f.id<?))" : ""}
    ORDER BY f.created_at DESC,f.id DESC LIMIT 21`
  )
    .bind(
      kind,
      kind,
      visitor,
      visitor,
      status,
      status,
      ...(after ? [after.time, after.time, after.id] : [])
    )
    .all<FeedbackRow>();
  const counts = await env.DB.prepare(
    `SELECT f.status,COUNT(*) AS n FROM app_feedback f WHERE ${filters} GROUP BY f.status`
  )
    .bind(kind, kind, visitor, visitor)
    .all<{ status: AppFeedbackStatus; n: number }>();
  return json<AppFeedbackPage>({
    items: rows.results.slice(0, 20).map(summaryDto),
    nextCursor: nextCursor(rows.results, scope),
    counts: Object.fromEntries(
      STATUSES.map(key => [key, counts.results.find(row => row.status === key)?.n ?? 0])
    ) as Record<AppFeedbackStatus, number>,
  });
}

async function detail(env: Env, id: string): Promise<AppFeedbackDetail> {
  const row = await env.DB.prepare(`${ROW_SELECT} WHERE f.id=?`).bind(id).first<FeedbackRow>();
  if (!row) fail(404, "NOT_FOUND", "反馈不存在或已过期删除");
  const attachments = await env.DB.prepare(
    "SELECT id,kind,mime,size FROM app_feedback_attachments WHERE feedback_id=? ORDER BY position"
  )
    .bind(id)
    .all<AppFeedbackAttachment>();
  return {
    ...summaryDto(row),
    contact: row.contact,
    context: parseContext(row.context_json),
    note: row.note,
    revision: row.revision,
    attachments: attachments.results,
    updatedAt: row.updated_at,
  };
}

async function update(request: Request, env: Env, id: string) {
  const input = await body(request);
  if (
    !Number.isSafeInteger(input.revision) ||
    (input.status !== undefined && !STATUSES.includes(input.status as AppFeedbackStatus)) ||
    (input.note !== undefined &&
      (typeof input.note !== "string" || input.note.length > LIMITS.note)) ||
    (input.status === undefined && input.note === undefined)
  )
    fail(400, "INVALID_INPUT", `请提供有效状态或不超过${LIMITS.note}字的备注`);
  const result = await env.DB.prepare(
    "UPDATE app_feedback SET status=COALESCE(?,status),note=COALESCE(?,note),revision=revision+1,updated_at=? WHERE id=? AND revision=?"
  )
    .bind(
      (input.status as string | undefined) ?? null,
      (input.note as string | undefined) ?? null,
      new Date().toISOString(),
      id,
      input.revision
    )
    .run();
  if (!result.meta.changes) {
    await detail(env, id);
    fail(409, "REVISION_CONFLICT", "这条反馈刚被更新过，请刷新后重试");
  }
  return json(await detail(env, id));
}

async function attachment(env: Env, feedbackId: string, attachmentId: string) {
  const row = await env.DB.prepare(
    "SELECT * FROM app_feedback_attachments WHERE id=? AND feedback_id=?"
  )
    .bind(attachmentId, feedbackId)
    .first<AttachmentRow>();
  const object = row ? await env.FEEDBACK.get(row.object_key) : null;
  if (!row || !object) return fail(404, "NOT_FOUND", "附件不存在或已过期删除");
  const name = `feedback-${feedbackId.slice(0, 8)}-${row.kind}`;
  return new Response(await object.arrayBuffer(), {
    headers: {
      "Content-Type": row.mime,
      // 附件来自匿名用户：沙箱化，图片之外一律按下载处理
      "Content-Security-Policy": "sandbox",
      "Content-Disposition":
        row.kind === "image"
          ? "inline"
          : `attachment; filename="${name}.${row.kind === "perf" ? "json" : "log"}.gz"`,
    },
  });
}

export async function appFeedbackModerationRoute(
  request: Request,
  env: Env,
  reviewer: string,
  path: string
) {
  if (path !== PREFIX && !path.startsWith(PREFIX + "/")) return null;
  if (!isReviewer(env, reviewer)) fail(403, "FORBIDDEN", "只有管理员可以查看用户反馈");
  if (path === PREFIX && request.method === "GET") return list(env, new URL(request.url));
  const match = /^\/([\w-]{1,80})(?:\/attachments\/([\w-]{1,80}))?$/.exec(
    path.slice(PREFIX.length)
  );
  if (match && !match[2] && request.method === "GET") return json(await detail(env, match[1]));
  if (match && !match[2] && request.method === "PATCH") return update(request, env, match[1]);
  if (match?.[2] && request.method === "GET") return attachment(env, match[1], match[2]);
  return fail(404, "NOT_FOUND", "接口不存在");
}

/** 定时清理：清理过期的额度计数。反馈记录和附件永久保留。 */
export async function cleanAppFeedback(env: Env) {
  // 只清理额度计数，不删除反馈记录和附件
  const today = new Date().toISOString().slice(0, 10);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM app_feedback_ip_limits WHERE day<?").bind(today),
    env.DB.prepare("DELETE FROM app_feedback_daily_bytes WHERE day<?").bind(today),
  ]);
}
