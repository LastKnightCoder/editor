import { comparePluginVersions } from "@tau/plugins/package";
import type {
  ManagedPlugin,
  ManagedPluginFilter,
  ModerationPage,
  PluginModerationAction,
  PluginModerationEvent,
} from "../contracts";
import { body, fail, isReviewer, json, type Env } from "./platform";
import { boundary, nextCursor } from "./moderation";

interface PluginRow {
  id: string;
  repository: string;
  disabled_at: string | null;
  disabled_by: string | null;
  disabled_reason: string | null;
  login: string;
  avatar_url: string;
  release_count: number;
  downloads_total: number;
}
interface LatestRow {
  plugin_id: string;
  version: string;
  name: string;
  published_at: string;
}
interface EventRow {
  id: string;
  reviewer_id: string;
  client_request_id: string;
  plugin_id: string;
  action: PluginModerationAction;
  reason: string;
  created_at: string;
}
const ACTIONS: PluginModerationAction[] = ["disable_plugin", "enable_plugin"];
const STATUSES: ManagedPluginFilter["status"][] = ["all", "active", "disabled"];
const eventDto = (row: EventRow): PluginModerationEvent => ({
  id: row.id,
  reviewer: row.reviewer_id,
  pluginId: row.plugin_id,
  action: row.action,
  reason: row.reason,
  createdAt: row.created_at,
});

/** 插件列表按 ID 升序分页，游标只需最后一个 ID。 */
function pluginCursor(url: URL, scope: string): string | null {
  const cursor = url.searchParams.get("cursor");
  if (!cursor) return null;
  try {
    const value = JSON.parse(atob(cursor));
    if (value.scope !== scope || typeof value.id !== "string") throw new Error();
    return value.id;
  } catch {
    return fail(400, "INVALID_INPUT", "分页游标无效，请刷新列表");
  }
}

async function listPlugins(env: Env, url: URL): Promise<ModerationPage<ManagedPlugin>> {
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const status = (url.searchParams.get("status") ?? "all") as ManagedPluginFilter["status"];
  if (q.length > 200 || !STATUSES.includes(status)) fail(400, "INVALID_INPUT", "插件筛选无效");
  const scope = JSON.stringify(["plugins", q, status]);
  const after = pluginCursor(url, scope);
  // 名称匹配任一已发布版本（与目录候选筛选同口径），最终展示名取最高版本。
  const rows = await env.DB.prepare(
    `SELECT p.id,p.repository,p.disabled_at,p.disabled_by,p.disabled_reason,pub.login,pub.avatar_url,
      (SELECT COUNT(*) FROM releases r WHERE r.plugin_id=p.id AND r.state='published') AS release_count,
      COALESCE(t.downloads,0) AS downloads_total
    FROM plugins p JOIN publishers pub ON pub.id=p.publisher_id
    LEFT JOIN plugin_download_totals t ON t.plugin_id=p.id
    WHERE (?='' OR instr(lower(p.id),?)>0 OR EXISTS(SELECT 1 FROM releases r WHERE r.plugin_id=p.id AND r.state='published' AND instr(lower(r.name),?)>0))
    ${status === "all" ? "" : `AND p.disabled_at IS ${status === "disabled" ? "NOT NULL" : "NULL"}`}
    ${after ? "AND p.id>?" : ""}
    ORDER BY p.id ASC LIMIT 21`
  )
    .bind(q, q, q, ...(after ? [after] : []))
    .all<PluginRow>();
  const page = rows.results.slice(0, 20);
  const latest = new Map<string, LatestRow>();
  if (page.length) {
    const marks = page.map(() => "?").join(",");
    const versions = await env.DB.prepare(
      `SELECT plugin_id,version,name,published_at FROM releases WHERE state='published' AND plugin_id IN (${marks})`
    )
      .bind(...page.map(row => row.id))
      .all<LatestRow>();
    for (const row of versions.results) {
      const current = latest.get(row.plugin_id);
      if (!current || comparePluginVersions(row.version, current.version) > 0)
        latest.set(row.plugin_id, row);
    }
  }
  return {
    items: page.map(row => {
      const top = latest.get(row.id);
      return {
        pluginId: row.id,
        name: top?.name ?? null,
        publisher: { login: row.login, avatarUrl: row.avatar_url },
        repository: row.repository,
        releaseCount: row.release_count,
        latestVersion: top?.version ?? null,
        latestPublishedAt: top?.published_at ?? null,
        downloadsTotal: row.downloads_total,
        disabled: row.disabled_at
          ? { reason: row.disabled_reason ?? "", at: row.disabled_at, by: row.disabled_by ?? "" }
          : null,
      };
    }),
    nextCursor: rows.results.length > 20 ? btoa(JSON.stringify({ scope, id: page[19].id })) : null,
  };
}

export async function pluginModerationRoute(
  request: Request,
  env: Env,
  reviewer: string,
  path: string
) {
  if (!path.startsWith("/v1/moderation/plugin")) return null;
  if (!isReviewer(env, reviewer)) fail(403, "FORBIDDEN", "只有管理员可以管理插件");
  const url = new URL(request.url);
  if (path === "/v1/moderation/plugins" && request.method === "GET")
    return json(await listPlugins(env, url));
  if (path === "/v1/moderation/plugin-events" && request.method === "GET") {
    const after = boundary(url, "plugin-events");
    const rows = await env.DB.prepare(
      `SELECT * FROM plugin_moderation_events ${after ? "WHERE created_at<? OR (created_at=? AND id<?)" : ""} ORDER BY created_at DESC,id DESC LIMIT 21`
    )
      .bind(...(after ? [after.time, after.time, after.id] : []))
      .all<EventRow>();
    return json<ModerationPage<PluginModerationEvent>>({
      items: rows.results.slice(0, 20).map(eventDto),
      nextCursor: nextCursor(rows.results, "plugin-events"),
    });
  }
  if (path !== "/v1/moderation/plugin-actions" || request.method !== "POST")
    return fail(404, "NOT_FOUND", "接口不存在");
  const input = await body(request);
  if (
    typeof input.pluginId !== "string" ||
    !/^[\w.-]{1,128}$/.test(input.pluginId) ||
    typeof input.action !== "string" ||
    !ACTIONS.includes(input.action as PluginModerationAction) ||
    typeof input.reason !== "string" ||
    !input.reason.trim() ||
    input.reason.trim().length > 1000 ||
    typeof input.clientRequestId !== "string" ||
    !/^[\w-]{16,80}$/.test(input.clientRequestId)
  )
    fail(400, "INVALID_INPUT", "请提供有效插件、操作、请求ID和1至1000字的原因");
  const action = input.action as PluginModerationAction,
    reason = input.reason.trim();
  const readPrevious = () =>
    env.DB.prepare(
      "SELECT * FROM plugin_moderation_events WHERE reviewer_id=? AND client_request_id=?"
    )
      .bind(reviewer, input.clientRequestId)
      .first<EventRow>();
  const result = (row: EventRow) => {
    if (row.plugin_id !== input.pluginId || row.action !== action || row.reason !== reason)
      fail(409, "REVISION_CONFLICT", "请求ID已用于其他操作");
    return json(eventDto(row));
  };
  const previous = await readPrevious();
  if (previous) return result(previous);
  const target = await env.DB.prepare("SELECT disabled_at FROM plugins WHERE id=?")
    .bind(input.pluginId)
    .first<{ disabled_at: string | null }>();
  if (!target) fail(404, "NOT_FOUND", "插件不存在");
  const id = crypto.randomUUID(),
    now = new Date().toISOString(),
    disabling = action === "disable_plugin";
  // 审计与状态更新共用事务；只有在当前状态匹配时才写审计行，重试不重放已完成的动作。
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO plugin_moderation_events(id,reviewer_id,client_request_id,plugin_id,action,reason,created_at)
      SELECT ?,?,?,?,?,?,? FROM plugins WHERE id=? AND disabled_at IS ${disabling ? "NULL" : "NOT NULL"}`
    ).bind(
      id,
      reviewer,
      input.clientRequestId,
      input.pluginId,
      action,
      reason,
      now,
      input.pluginId
    ),
    env.DB.prepare(
      "UPDATE plugins SET disabled_at=?,disabled_by=?,disabled_reason=? WHERE id=? AND EXISTS(SELECT 1 FROM plugin_moderation_events WHERE id=?)"
    ).bind(
      disabling ? now : null,
      disabling ? reviewer : null,
      disabling ? reason : null,
      input.pluginId,
      id
    ),
  ]);
  const completed = await readPrevious();
  if (!completed) fail(409, "REVISION_CONFLICT", "插件状态已变化，请刷新后重试");
  return result(completed);
}
