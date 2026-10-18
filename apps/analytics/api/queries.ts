import type {
  BreakdownRow,
  EventRow,
  Overview,
  QueryMeta,
  RetentionRow,
  TrendRow,
} from "../contracts";
import { regionLabel } from "./geo";
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
    metric_version: 1,
    from,
    to,
    product,
    environment,
    raw_retention_days: 30,
    aggregate_retention_days: 400,
  };
}

const windowArgs = (meta: QueryMeta) => [meta.product, meta.environment, meta.from, meta.to];
const timeArgs = (meta: QueryMeta) => [
  meta.product,
  meta.environment,
  dayStart(meta.from),
  dayStart(meta.to) + 86400000,
];
const dailyWhere = "product=? AND environment=? AND day>=? AND day<=?";

export async function overview(env: Env, meta: QueryMeta): Promise<Overview> {
  const result = await env.DB.prepare(
    `SELECT
    (SELECT COUNT(DISTINCT installation_id) FROM daily_activity WHERE ${dailyWhere}) AS active_installations,
    (SELECT COUNT(*) FROM installations WHERE product=? AND environment=? AND installed_at>=? AND installed_at<?) AS new_installations,
    (SELECT COALESCE(SUM(count),0) FROM daily_events WHERE ${dailyWhere}) AS events,
    (SELECT COUNT(*) FROM sessions WHERE product=? AND environment=? AND started_at>=? AND started_at<?) AS sessions,
    (SELECT COALESCE(SUM(foreground_ms),0) FROM sessions WHERE product=? AND environment=? AND started_at>=? AND started_at<?) AS foreground_ms,
    (SELECT COALESCE(SUM(count),0) FROM daily_events WHERE ${dailyWhere} AND name='crash') AS crashes,
    (SELECT COALESCE(SUM(count),0) FROM daily_downloads WHERE ${dailyWhere}) AS download_starts`
  )
    .bind(
      ...windowArgs(meta),
      ...timeArgs(meta),
      ...windowArgs(meta),
      ...timeArgs(meta),
      ...timeArgs(meta),
      ...windowArgs(meta),
      ...windowArgs(meta)
    )
    .first<Overview>();
  if (!result) throw new Error("统计汇总未返回结果");
  return result;
}

export async function timeseries(env: Env, meta: QueryMeta): Promise<TrendRow[]> {
  const [activity, installations, downloads] = await Promise.all([
    env.DB.prepare(
      `SELECT day,COUNT(*) AS active_installations,SUM(event_count) AS events FROM daily_activity WHERE ${dailyWhere} GROUP BY day`
    )
      .bind(...windowArgs(meta))
      .all<TrendRow>(),
    env.DB.prepare(
      "SELECT date(installed_at/1000,'unixepoch','+8 hours') AS day,COUNT(*) AS new_installations FROM installations WHERE product=? AND environment=? AND installed_at>=? AND installed_at<? GROUP BY day"
    )
      .bind(...timeArgs(meta))
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
    rows.set(day, {
      day,
      active_installations: 0,
      new_installations: 0,
      events: 0,
      download_starts: 0,
    });
  }
  for (const result of [activity, installations, downloads])
    for (const row of result.results) {
      const existing = rows.get(row.day);
      if (existing) Object.assign(existing, row);
    }
  return [...rows.values()];
}

const dimensions: Record<
  string,
  { table: string; key: string; count: string; condition?: string; region?: boolean }
> = {
  provinces: {
    table: "daily_activity",
    key: "region_code",
    count: "COUNT(DISTINCT installation_id)",
    condition: "country='CN'",
    region: true,
  },
  countries: { table: "daily_activity", key: "country", count: "COUNT(DISTINCT installation_id)" },
  os: { table: "daily_activity", key: "os", count: "COUNT(DISTINCT installation_id)" },
  versions: {
    table: "daily_activity",
    key: "app_version",
    count: "COUNT(DISTINCT installation_id)",
  },
  events: { table: "daily_events", key: "name", count: "SUM(count)" },
  pages: {
    table: "daily_events",
    key: "dimension",
    count: "SUM(count)",
    condition: "name='screen_view' AND event_version=1",
  },
  features: {
    table: "daily_events",
    key: "dimension",
    count: "SUM(count)",
    condition: "name='feature_used' AND event_version=1",
  },
  downloads: { table: "daily_downloads", key: "artifact || ' · ' || channel", count: "SUM(count)" },
  channels: { table: "daily_downloads", key: "channel", count: "SUM(count)" },
  download_provinces: {
    table: "daily_downloads",
    key: "region_code",
    count: "SUM(count)",
    condition: "country='CN'",
    region: true,
  },
};
export async function breakdown(
  env: Env,
  meta: QueryMeta,
  dimension: string
): Promise<BreakdownRow[]> {
  if (!Object.hasOwn(dimensions, dimension)) fail(400, "DIMENSION", "不支持的统计维度");
  const spec = dimensions[dimension];
  const result = await env.DB.prepare(
    `SELECT ${spec.key} AS key,${spec.count} AS count FROM ${spec.table} WHERE ${dailyWhere}${spec.condition ? ` AND ${spec.condition}` : ""} GROUP BY ${spec.key} ORDER BY count DESC,key ASC LIMIT 100`
  )
    .bind(...windowArgs(meta))
    .all<{ key: string; count: number }>();
  return result.results.map(row => ({
    ...row,
    label: spec.region ? regionLabel(row.key) : row.key || "未知",
  }));
}

export async function retention(env: Env, meta: QueryMeta): Promise<RetentionRow[]> {
  const result = await env.DB.prepare(
    `SELECT date(i.installed_at/1000,'unixepoch','+8 hours') AS day,COUNT(*) AS installations,
    SUM(EXISTS(SELECT 1 FROM daily_activity a WHERE a.product=i.product AND a.environment=i.environment AND a.installation_id=i.installation_id AND a.day=date(i.installed_at/1000,'unixepoch','+8 hours','+1 day'))) AS d1,
    SUM(EXISTS(SELECT 1 FROM daily_activity a WHERE a.product=i.product AND a.environment=i.environment AND a.installation_id=i.installation_id AND a.day=date(i.installed_at/1000,'unixepoch','+8 hours','+7 day'))) AS d7,
    SUM(EXISTS(SELECT 1 FROM daily_activity a WHERE a.product=i.product AND a.environment=i.environment AND a.installation_id=i.installation_id AND a.day=date(i.installed_at/1000,'unixepoch','+8 hours','+30 day'))) AS d30
    FROM installations i WHERE i.product=? AND i.environment=? AND i.installed_at>=? AND i.installed_at<? GROUP BY day ORDER BY day DESC`
  )
    .bind(...timeArgs(meta))
    .all<RetentionRow>();
  const today = dayStart(shanghaiDay());
  return result.results.map(row => ({
    ...row,
    d1: dayStart(row.day) + 86400000 < today ? row.d1 : null,
    d7: dayStart(row.day) + 7 * 86400000 < today ? row.d7 : null,
    d30: dayStart(row.day) + 30 * 86400000 < today ? row.d30 : null,
  }));
}

export async function recentEvents(env: Env, meta: QueryMeta): Promise<EventRow[]> {
  const result = await env.DB.prepare(
    `SELECT event_id,name,event_version,occurred_at,received_at,app_version,country,region_code,properties_json FROM events WHERE ${dailyWhere} ORDER BY occurred_at DESC,event_id DESC LIMIT 50`
  )
    .bind(...windowArgs(meta))
    .all<Omit<EventRow, "properties"> & { properties_json: string }>();
  return result.results.map(({ properties_json, ...row }) => ({
    ...row,
    properties: JSON.parse(properties_json),
  }));
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
        await breakdown(env, meta, url.searchParams.get("dimension") ?? "provinces"),
        meta
      );
    case "/v1/admin/retention":
      return json(await retention(env, meta), meta);
    case "/v1/admin/events":
      return json(await recentEvents(env, meta), meta);
    default:
      return fail(404, "NOT_FOUND", "接口不存在");
  }
}
