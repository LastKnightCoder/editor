import type { PluginComment, PluginCommunity } from "../contracts";
import { body, fail, json, type Env } from "./platform";
import { visitorFor } from "./visitors";

interface CommentRow {
  id: string;
  plugin_id: string;
  visitor_id: string;
  message: string;
  created_at: string;
  deleted: number;
}
const present = (row: CommentRow, visitorId?: string): PluginComment => ({
  id: row.id,
  message: row.message,
  createdAt: row.created_at,
  canDelete: !row.deleted && row.visitor_id === visitorId,
  deleted: !!row.deleted,
});

export async function communityRoute(request: Request, env: Env, path: string) {
  const match = path.match(/^\/v1\/plugins\/([^/]+)\/(community|like|comments)(?:\/([^/]+))?$/);
  if (!match) return null;
  const [, pluginId, action, commentId] = match;
  if (
    !(await env.DB.prepare("SELECT 1 FROM releases WHERE plugin_id=? AND state='published' LIMIT 1")
      .bind(pluginId)
      .first())
  )
    fail(404, "NOT_FOUND", "插件尚未发布");
  const identity = await visitorFor(request, env);
  const visitorId = identity && !identity.revoked ? identity.id : undefined;
  if (request.method === "GET" && action === "community" && !commentId) {
    const cursor = new URL(request.url).searchParams.get("cursor");
    let boundary: CommentRow | null = null;
    if (cursor) {
      boundary = await env.DB.prepare("SELECT * FROM plugin_comments WHERE id=? AND plugin_id=?")
        .bind(cursor, pluginId)
        .first<CommentRow>();
      if (!boundary) fail(400, "INVALID_INPUT", "评论游标无效");
    }
    const rows = await env.DB.prepare(
      `SELECT * FROM plugin_comments WHERE plugin_id=? AND deleted=0
       ${boundary ? "AND (created_at<? OR (created_at=? AND id<?))" : ""}
       ORDER BY created_at DESC,id DESC LIMIT 21`
    )
      .bind(pluginId, ...(boundary ? [boundary.created_at, boundary.created_at, boundary.id] : []))
      .all<CommentRow>();
    const likes = await env.DB.prepare(
      "SELECT COUNT(*) AS total, COALESCE(MAX(visitor_id=?),0) AS liked FROM plugin_likes WHERE plugin_id=?"
    )
      .bind(visitorId ?? "", pluginId)
      .first<{ total: number; liked: number }>();
    if (!likes) fail(500, "INTERNAL_ERROR", "无法读取喜欢统计");
    return json<PluginCommunity>({
      likes: likes.total,
      liked: !!likes.liked,
      comments: rows.results.slice(0, 20).map(row => present(row, visitorId)),
      nextCursor: rows.results.length > 20 ? rows.results[19].id : null,
    });
  }
  if (!visitorId) fail(403, "FORBIDDEN", "匿名身份失效或已停用，请刷新后重试");
  if (request.headers.get("X-Tau-Visitor") !== "1") fail(403, "FORBIDDEN", "缺少匿名请求标识");
  if (request.method === "PUT" && action === "like" && !commentId) {
    const input = await body(request);
    if (typeof input.liked !== "boolean") fail(400, "INVALID_INPUT", "liked必须为布尔值");
    await env.DB.prepare(
      input.liked
        ? "INSERT OR IGNORE INTO plugin_likes(plugin_id,visitor_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM visitors WHERE id=? AND revoked=0)"
        : "DELETE FROM plugin_likes WHERE plugin_id=? AND visitor_id=? AND EXISTS(SELECT 1 FROM visitors WHERE id=? AND revoked=0)"
    )
      .bind(pluginId, visitorId, visitorId)
      .run();
    if ((await visitorFor(request, env))?.revoked) fail(403, "FORBIDDEN", "匿名身份已停用");
    return json({ liked: input.liked });
  }
  if (request.method === "POST" && action === "comments" && !commentId) {
    const input = await body(request);
    const message = typeof input.message === "string" ? input.message.trim() : "";
    if (!message || message.length > 2000) fail(400, "INVALID_INPUT", "评论需要1至2000字符");
    if (typeof input.clientRequestId !== "string" || !/^[\w-]{16,80}$/.test(input.clientRequestId))
      fail(400, "INVALID_INPUT", "评论请求ID无效");
    const now = new Date().toISOString();
    // 单语句检查额度并插入；删除仅清空正文，不能通过删除绕过每日额度。
    await env.DB.prepare(
      `INSERT OR IGNORE INTO plugin_comments(id,plugin_id,visitor_id,client_request_id,message,created_at)
      SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM plugin_comments WHERE visitor_id=? AND created_at>=?)<20
      AND EXISTS(SELECT 1 FROM visitors WHERE id=? AND revoked=0)`
    )
      .bind(
        crypto.randomUUID(),
        pluginId,
        visitorId,
        input.clientRequestId,
        message,
        now,
        visitorId,
        now.slice(0, 10),
        visitorId
      )
      .run();
    const row = await env.DB.prepare(
      "SELECT * FROM plugin_comments WHERE visitor_id=? AND client_request_id=?"
    )
      .bind(visitorId, input.clientRequestId)
      .first<CommentRow>();
    if (!row) {
      if ((await visitorFor(request, env))?.revoked) fail(403, "FORBIDDEN", "匿名身份已停用");
      fail(429, "LIMIT_EXCEEDED", "每天最多发表20条评论，请明天再试");
    }
    if (row.plugin_id !== pluginId || (!row.deleted && row.message !== message))
      fail(409, "COMMENT_REQUEST_CONFLICT", "请求ID已经用于另一条评论");
    return json(present(row, visitorId));
  }
  if (request.method === "DELETE" && action === "comments" && commentId) {
    const result = await env.DB.prepare(
      "UPDATE plugin_comments SET message='',deleted=1 WHERE id=? AND plugin_id=? AND visitor_id=?"
    )
      .bind(commentId, pluginId, visitorId)
      .run();
    if (!result.meta.changes) fail(404, "NOT_FOUND", "评论不存在或不属于当前匿名身份");
    return json({ deleted: true });
  }
  return fail(404, "NOT_FOUND", "接口不存在");
}
