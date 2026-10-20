import { visitorFor } from "./visitors";
import { fail, VISIBLE_PLUGIN, type Env } from "./platform";
import type { DownloadStatistics } from "../contracts";

export function downloadWindow() {
  const day = new Date().toISOString().slice(0, 10);
  return { day, windowStart: new Date(Date.parse(day) - 6 * 86400000).toISOString().slice(0, 10) };
}

export async function pluginStatistics(env: Env, pluginId: string): Promise<DownloadStatistics> {
  const { day, windowStart } = downloadWindow();
  const result = await env.DB.prepare(
    `SELECT
    COALESCE((SELECT downloads FROM plugin_download_totals WHERE plugin_id=?),0) AS downloadsTotal,
    COALESCE((SELECT SUM(downloads) FROM plugin_download_daily WHERE plugin_id=? AND day>=? AND day<=?),0) AS downloads7d
    WHERE EXISTS(SELECT 1 FROM releases r WHERE r.plugin_id=? AND r.state='published' AND ${VISIBLE_PLUGIN})`
  )
    .bind(pluginId, pluginId, windowStart, day, pluginId)
    .first<{ downloadsTotal: number; downloads7d: number }>();
  if (!result) fail(404, "NOT_FOUND", "插件尚未发布");
  return { ...result, windowStart };
}

export async function countDownload(
  request: Request,
  env: Env,
  release: { id: string; plugin_id: string }
) {
  try {
    if (request.signal.aborted) return;
    const visitor = await visitorFor(request, env);
    if (!visitor || visitor.revoked) return;
    await env.DB.prepare(
      "INSERT OR IGNORE INTO download_receipts(visitor_id,release_id,plugin_id,day) VALUES(?,?,?,?)"
    )
      .bind(visitor.id, release.id, release.plugin_id, new Date().toISOString().slice(0, 10))
      .run();
  } catch {
    console.error("plugin_download_statistics_failed");
  }
}

export async function cleanDownloadReceipts(env: Env) {
  const day = (ago: number) => new Date(Date.now() - ago * 86400000).toISOString().slice(0, 10);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM download_receipts WHERE day<?").bind(day(2)),
    env.DB.prepare("DELETE FROM visitor_issue_limits WHERE hour<?").bind(day(2)),
    env.DB.prepare("DELETE FROM plugin_download_daily WHERE day<?").bind(day(90)),
  ]);
}
