import type {
  ModerationAction,
  ModerationComment,
  ModerationEvent,
  ModerationPage,
} from "../contracts";
import { body, fail, isReviewer, json, type Env } from "./platform";

interface EventRow {
  id: string;
  reviewer_id: string;
  client_request_id: string;
  comment_id: string;
  visitor_id: string;
  action: ModerationAction;
  reason: string;
  expected_revision: number;
  created_at: string;
}
export function boundary(url: URL, scope: string) {
  const cursor = url.searchParams.get("cursor");
  if (!cursor) return null;
  try {
    const value = JSON.parse(atob(cursor));
    if (value.scope !== scope || typeof value.time !== "string" || typeof value.id !== "string")
      throw new Error();
    return value as { time: string; id: string };
  } catch {
    return fail(400, "INVALID_INPUT", "分页游标无效，请刷新列表");
  }
}
export function nextCursor(rows: { id: string; created_at: string }[], scope: string) {
  const last = rows[19];
  return rows.length > 20
    ? btoa(JSON.stringify({ scope, time: last.created_at, id: last.id }))
    : null;
}
const eventDto = (row: EventRow): ModerationEvent => ({
  id: row.id,
  reviewer: row.reviewer_id,
  commentId: row.comment_id,
  visitorId: row.visitor_id,
  action: row.action,
  reason: row.reason,
  createdAt: row.created_at,
});

export async function moderationRoute(request: Request, env: Env, reviewer: string, path: string) {
  if (!path.startsWith("/v1/moderation/")) return null;
  if (!isReviewer(env, reviewer)) fail(403, "FORBIDDEN", "只有管理员可以管理评论");
  const url = new URL(request.url);
  if (path === "/v1/moderation/comments" && request.method === "GET") {
    const plugin = url.searchParams.get("pluginId") ?? "",
      visitor = url.searchParams.get("visitorId") ?? "";
    const status = url.searchParams.get("status") ?? "visible";
    if (
      !["visible", "deleted", "all"].includes(status) ||
      !/^[\w.-]{0,128}$/.test(plugin) ||
      !/^[\w-]{0,80}$/.test(visitor)
    )
      fail(400, "INVALID_INPUT", "评论筛选无效");
    const scope = JSON.stringify([plugin, visitor, status]);
    const after = boundary(url, scope);
    const rows = await env.DB.prepare(
      `SELECT c.*,v.revoked,v.revision FROM plugin_comments c JOIN visitors v ON v.id=c.visitor_id
      WHERE (?='' OR c.plugin_id=?) AND (?='' OR c.visitor_id=?)
      ${status === "all" ? "" : `AND c.deleted=${status === "deleted" ? 1 : 0}`}
      ${after ? "AND (c.created_at<? OR (c.created_at=? AND c.id<?))" : ""}
      ORDER BY c.created_at DESC,c.id DESC LIMIT 21`
    )
      .bind(plugin, plugin, visitor, visitor, ...(after ? [after.time, after.time, after.id] : []))
      .all<{
        id: string;
        plugin_id: string;
        visitor_id: string;
        message: string;
        created_at: string;
        deleted: number;
        revoked: number;
        revision: number;
      }>();
    return json<ModerationPage<ModerationComment>>({
      items: rows.results.slice(0, 20).map(row => ({
        id: row.id,
        pluginId: row.plugin_id,
        visitorId: row.visitor_id,
        message: row.message,
        createdAt: row.created_at,
        deleted: !!row.deleted,
        suspended: !!row.revoked,
        visitorRevision: row.revision,
      })),
      nextCursor: nextCursor(rows.results, scope),
    });
  }
  if (path === "/v1/moderation/events" && request.method === "GET") {
    const after = boundary(url, "events");
    const rows = await env.DB.prepare(
      `SELECT * FROM moderation_events ${after ? "WHERE created_at<? OR (created_at=? AND id<?)" : ""} ORDER BY created_at DESC,id DESC LIMIT 21`
    )
      .bind(...(after ? [after.time, after.time, after.id] : []))
      .all<EventRow>();
    return json<ModerationPage<ModerationEvent>>({
      items: rows.results.slice(0, 20).map(eventDto),
      nextCursor: nextCursor(rows.results, "events"),
    });
  }
  if (path !== "/v1/moderation/actions" || request.method !== "POST")
    return fail(404, "NOT_FOUND", "接口不存在");
  const input = await body(request);
  if (
    typeof input.commentId !== "string" ||
    !/^[\w-]{1,80}$/.test(input.commentId) ||
    typeof input.action !== "string" ||
    !["delete_comment", "suspend_visitor", "restore_visitor"].includes(input.action) ||
    typeof input.reason !== "string" ||
    !input.reason.trim() ||
    input.reason.trim().length > 1000 ||
    !Number.isSafeInteger(input.revision) ||
    (input.revision as number) < 0 ||
    typeof input.clientRequestId !== "string" ||
    !/^[\w-]{16,80}$/.test(input.clientRequestId)
  )
    fail(400, "INVALID_INPUT", "请提供有效操作、版本、请求ID和1至1000字的原因");
  const reason = input.reason.trim();
  const readPrevious = () =>
    env.DB.prepare("SELECT * FROM moderation_events WHERE reviewer_id=? AND client_request_id=?")
      .bind(reviewer, input.clientRequestId)
      .first<EventRow>();
  const result = (row: EventRow) => {
    if (
      row.comment_id !== input.commentId ||
      row.action !== input.action ||
      row.reason !== reason ||
      row.expected_revision !== input.revision
    )
      fail(409, "REVISION_CONFLICT", "请求ID已用于其他操作");
    return json(eventDto(row));
  };
  const previous = await readPrevious();
  if (previous) return result(previous);
  const target = await env.DB.prepare("SELECT visitor_id FROM plugin_comments WHERE id=?")
    .bind(input.commentId)
    .first<{ visitor_id: string }>();
  if (!target) fail(404, "NOT_FOUND", "评论不存在");
  const id = crypto.randomUUID(),
    now = new Date().toISOString();
  const deleting = input.action === "delete_comment";
  const revoked = input.action === "suspend_visitor" ? 1 : 0;
  // 审计与处置共用事务；仅新审计行可驱动更新，重试不重放已完成的动作。
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO moderation_events(id,reviewer_id,client_request_id,comment_id,visitor_id,action,reason,expected_revision,created_at)
      SELECT ?,?,?,?,?,?,?,?,? FROM plugin_comments c JOIN visitors v ON v.id=c.visitor_id WHERE c.id=? AND ${deleting ? "c.deleted=0 AND ?=0" : "v.revision=? AND v.revoked<>?"}`
    ).bind(
      id,
      reviewer,
      input.clientRequestId,
      input.commentId,
      target.visitor_id,
      input.action,
      reason,
      input.revision,
      now,
      input.commentId,
      input.revision,
      ...(deleting ? [] : [revoked])
    ),
    deleting
      ? env.DB.prepare(
          "UPDATE plugin_comments SET deleted=1,message='' WHERE id=? AND EXISTS(SELECT 1 FROM moderation_events WHERE id=?)"
        ).bind(input.commentId, id)
      : env.DB.prepare(
          "UPDATE visitors SET revoked=?,revision=revision+1 WHERE id=? AND EXISTS(SELECT 1 FROM moderation_events WHERE id=?)"
        ).bind(revoked, target.visitor_id, id),
  ]);
  const completed = await readPrevious();
  if (!completed) fail(409, "REVISION_CONFLICT", "目标已变化，请刷新后重试");
  return result(completed);
}
