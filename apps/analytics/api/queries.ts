import type { BreakdownRow, Overview, QueryMeta, TrendRow } from "../contracts";
import { dayStart, fail, json, shanghaiDay, type Env } from "./platform";

export function queryWindow(url: URL): QueryMeta {
  const to = url.searchParams.get("to") ?? shanghaiDay();
  const validDay = (day: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(dayStart(day)) &&
    shanghaiDay(dayStart(day)) === day;
  if (!validDay(to)) fail(400, "DATE_RANGE", "结束日期无效");
  const from = url.searchParams.get("from") ?? shanghaiDay(dayStart(to) - 6 * 86400000);
  if (
    !validDay(from) ||
    !validDay(to) ||
    from > to ||
    to > shanghaiDay() ||
    dayStart(to) - dayStart(from) > 89 * 86400000 ||
    from < shanghaiDay(Date.now() - 399 * 86400000)
  )
    fail(400, "DATE_RANGE", "请选择保留范围内最多90天的有效日期");
  const product = url.searchParams.get("product") ?? "tau-desktop";
  const environment = url.searchParams.get("environment") ?? "production";
  if (product !== "tau-desktop" || !["production", "development"].includes(environment))
    fail(400, "SCOPE", "产品或环境无效");
  return {
    timezone: "Asia/Shanghai",
    metric_version: 2,
    from,
    to,
    product,
    environment,
    aggregate_retention_days: 400,
  };
}

const windowArgs = (meta: QueryMeta) => [meta.product, meta.environment, meta.from, meta.to];
const dailyWhere = "product=? AND environment=? AND day>=? AND day<=?";

export async function overview(env: Env, meta: QueryMeta): Promise<Overview> {
  const result = await env.DB.prepare(
    `SELECT
     (SELECT COUNT(DISTINCT installation_id) FROM installation_versions WHERE ${dailyWhere}) AS reporting_installations,
     (SELECT COALESCE(SUM(count),0) FROM daily_downloads WHERE ${dailyWhere}) AS download_starts`
  )
    .bind(...windowArgs(meta), ...windowArgs(meta))
    .first<Overview>();
  if (!result) throw new Error("统计汇总未返回结果");
  return result;
}

export async function timeseries(env: Env, meta: QueryMeta): Promise<TrendRow[]> {
  const [versions, downloads] = await Promise.all([
    env.DB.prepare(
      `SELECT day,COUNT(*) AS reporting_installations FROM installation_versions WHERE ${dailyWhere} GROUP BY day`
    )
      .bind(...windowArgs(meta))
      .all<TrendRow>(),
    env.DB.prepare(
      `SELECT day,SUM(count) AS download_starts FROM daily_downloads WHERE ${dailyWhere} GROUP BY day`
    )
      .bind(...windowArgs(meta))
      .all<TrendRow>(),
  ]);
  const rows = new Map<string, TrendRow>();
  for (let time = dayStart(meta.from); time <= dayStart(meta.to); time += 86400000) {
    const day = shanghaiDay(time);
    rows.set(day, { day, reporting_installations: 0, download_starts: 0 });
  }
  for (const result of [versions, downloads])
    for (const row of result.results) {
      const existing = rows.get(row.day);
      if (existing) Object.assign(existing, row);
    }
  return [...rows.values()];
}

export async function breakdown(
  env: Env,
  meta: QueryMeta,
  dimension: string
): Promise<BreakdownRow[]> {
  let sql: string;
  if (dimension === "versions") {
    sql = `WITH latest AS (
      SELECT app_version,ROW_NUMBER() OVER(PARTITION BY installation_id ORDER BY reported_at DESC) AS position
      FROM installation_versions WHERE ${dailyWhere}
    ) SELECT app_version AS key,COUNT(*) AS count FROM latest WHERE position=1 GROUP BY app_version ORDER BY count DESC,key ASC LIMIT 100`;
  } else if (dimension === "downloads" || dimension === "channels") {
    const key = dimension === "downloads" ? "artifact || ' · ' || channel" : "channel";
    sql = `SELECT ${key} AS key,SUM(count) AS count FROM daily_downloads WHERE ${dailyWhere} GROUP BY ${key} ORDER BY count DESC,key ASC LIMIT 100`;
  } else return fail(400, "DIMENSION", "不支持的统计维度");
  const result = await env.DB.prepare(sql)
    .bind(...windowArgs(meta))
    .all<{ key: string; count: number }>();
  return result.results.map(row => ({ ...row, label: row.key || "未知" }));
}

export async function queryRoute(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const meta = queryWindow(url);
  switch (url.pathname) {
    case "/v1/admin/overview":
      return json(await overview(env, meta), meta);
    case "/v1/admin/timeseries":
      return json(await timeseries(env, meta), meta);
    case "/v1/admin/breakdown":
      return json(
        await breakdown(env, meta, url.searchParams.get("dimension") ?? "versions"),
        meta
      );
    default:
      return fail(404, "NOT_FOUND", "接口不存在");
  }
}
