import { REPORT_TTL_MS, type VersionReport } from "../contracts";
import { enforceLimit, fail, json, readJson, shanghaiDay, UUID, type Env } from "./platform";

export async function reportVersion(request: Request, env: Env): Promise<Response> {
  if (!env.VERSION_LIMITER) fail(503, "VERSION_LIMITER", "版本上报暂不可用");
  await enforceLimit(request, env.VERSION_LIMITER);
  const input = await readJson(request, 2048);
  const fields = [
    "schema_version",
    "product",
    "environment",
    "installation_id",
    "app_version",
    "reported_at",
  ];
  if (Object.keys(input).some(key => !fields.includes(key)))
    fail(400, "FIELDS", "版本上报包含不支持的字段");
  if (input.schema_version !== 1) fail(400, "SCHEMA_VERSION", "不支持的上报版本");
  if (input.product !== "tau-desktop") fail(400, "PRODUCT", "未启用的产品");
  if (input.environment !== "production" && input.environment !== "development")
    fail(400, "ENVIRONMENT", "环境无效");
  if (typeof input.installation_id !== "string" || !UUID.test(input.installation_id))
    fail(400, "INSTALLATION_ID", "安装标识无效");
  if (
    typeof input.app_version !== "string" ||
    !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/.test(input.app_version) ||
    input.app_version.length > 64
  )
    fail(400, "APP_VERSION", "应用版本无效");
  const now = Date.now();
  const time =
    typeof input.reported_at === "string" && /Z$/.test(input.reported_at)
      ? Date.parse(input.reported_at)
      : NaN;
  if (!Number.isFinite(time) || now - time > REPORT_TTL_MS || time - now > 300000)
    fail(400, "REPORT_TIME", "版本上报时间无效或已过期");
  const report = input as unknown as VersionReport;
  await env.DB.prepare(
    `INSERT INTO installation_versions(product,environment,day,installation_id,app_version,reported_at)
     VALUES(?,?,?,?,?,?) ON CONFLICT(product,environment,day,installation_id)
     DO UPDATE SET app_version=excluded.app_version,reported_at=excluded.reported_at
     WHERE excluded.reported_at>installation_versions.reported_at`
  )
    .bind(
      report.product,
      report.environment,
      shanghaiDay(time),
      report.installation_id,
      report.app_version,
      time
    )
    .run();
  return json({ app_version: report.app_version, reported_at: report.reported_at });
}
