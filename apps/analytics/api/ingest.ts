import {
  EVENT_TTL_MS,
  MAX_BATCH_EVENTS,
  MAX_BODY_BYTES,
  type AnalyticsEvent,
  type BatchReceipt,
  type EventContext,
} from "../contracts";
import { eventDefinitions, eventDimension, validateProperties } from "../contracts/events";
import { geolocation } from "./geo";
import {
  enforceLimit,
  fail,
  isRecord,
  json,
  readJson,
  shanghaiDay,
  UUID,
  type Env,
} from "./platform";

export async function ingest(request: Request, env: Env): Promise<Response> {
  await enforceLimit(request, env.INGEST_LIMITER);
  const input = await readJson(request, MAX_BODY_BYTES);
  if (input.schema_version !== 1) fail(400, "SCHEMA_VERSION", "不支持的信封版本");
  if (input.product !== "tau-desktop") fail(400, "PRODUCT", "未启用的产品");
  if (input.environment !== "production" && input.environment !== "development")
    fail(400, "ENVIRONMENT", "环境无效");
  if (typeof input.installation_id !== "string" || !UUID.test(input.installation_id))
    fail(400, "INSTALLATION_ID", "安装标识无效");
  if (
    !Array.isArray(input.events) ||
    !input.events.length ||
    input.events.length > MAX_BATCH_EVENTS
  )
    fail(400, "BATCH_SIZE", "每批需要 1–50 个事件");
  const now = Date.now();
  const receipt: BatchReceipt = {
    accepted: [],
    rejected: [],
    received_at: new Date(now).toISOString(),
  };
  const valid: AnalyticsEvent[] = [];
  for (const [index, item] of input.events.entries()) {
    const reject = (code: string, retryable = false) =>
      receipt.rejected.push({
        index,
        event_id: isRecord(item) && typeof item.event_id === "string" ? item.event_id : null,
        code,
        retryable,
      });
    if (
      !isRecord(item) ||
      typeof item.event_id !== "string" ||
      !UUID.test(item.event_id) ||
      typeof item.session_id !== "string" ||
      !UUID.test(item.session_id)
    ) {
      reject("EVENT_ID");
      continue;
    }
    const version = item.event_version ?? 1;
    if (
      typeof item.name !== "string" ||
      !Object.hasOwn(eventDefinitions, item.name) ||
      !Number.isInteger(version) ||
      !eventDefinitions[item.name]?.[version as number]
    ) {
      reject("UNSUPPORTED_EVENT", true);
      continue;
    }
    const time =
      typeof item.occurred_at === "string" && /Z$/.test(item.occurred_at)
        ? Date.parse(item.occurred_at)
        : NaN;
    if (!Number.isFinite(time) || now - time > EVENT_TTL_MS || time - now > 300000) {
      reject("EVENT_TIME");
      continue;
    }
    const context = item.context;
    if (
      !isRecord(context) ||
      ["app_version", "os", "arch", "locale"].some(
        key => typeof context[key] !== "string" || (context[key] as string).length > 64
      )
    ) {
      reject("EVENT_CONTEXT");
      continue;
    }
    const properties = validateProperties(item.name, version as number, item.properties ?? {});
    if (
      !properties ||
      (typeof properties.active_ms === "number" &&
        typeof (properties.uptime_ms ?? properties.duration_ms) === "number" &&
        properties.active_ms > Number(properties.uptime_ms ?? properties.duration_ms))
    ) {
      reject("EVENT_PROPERTIES");
      continue;
    }
    valid.push({
      event_id: item.event_id,
      session_id: item.session_id,
      name: item.name,
      event_version: version as number,
      occurred_at: new Date(time).toISOString(),
      context: context as unknown as EventContext,
      properties,
    });
  }
  const geo = geolocation(request);
  if (valid.length)
    await env.DB.batch(
      valid.map(event =>
        env.DB.prepare(
          `INSERT OR IGNORE INTO events(product,environment,event_id,installation_id,session_id,name,event_version,occurred_at,received_at,day,app_version,os,arch,locale,country,region_code,dimension,properties_json)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(
          input.product,
          input.environment,
          event.event_id,
          input.installation_id,
          event.session_id,
          event.name,
          event.event_version,
          Date.parse(event.occurred_at),
          now,
          shanghaiDay(Date.parse(event.occurred_at)),
          event.context.app_version,
          event.context.os,
          event.context.arch,
          event.context.locale,
          geo.country,
          geo.region_code,
          eventDimension(event.name, event.event_version, event.properties),
          JSON.stringify(event.properties)
        )
      )
    );
  receipt.accepted = valid.map(event => event.event_id);
  return json(receipt);
}
