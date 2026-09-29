import type Database from "better-sqlite3";
import type {
  ModelUsageBreakdownQuery,
  ModelUsageBreakdownRow,
  ModelUsageDimension,
  ModelUsageEvent,
  ModelUsageListResult,
  ModelUsageQuery,
  ModelUsageSummary,
  ModelUsageTimeseriesPoint,
  ModelUsageTimeseriesQuery,
} from "@/types/model-usage";

export const USAGE_SCHEMA_VERSION = 1;
const MAX_LIST_LIMIT = 500;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** 维度 → 列名（白名单，拼进 SQL 前必须经这里映射） */
const DIMENSION_COLUMNS: Record<ModelUsageDimension, string> = {
  model: "model",
  feature: "feature",
  provider: "provider_id",
  library: "library",
  device: "device_id",
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS usage_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS model_usage_event (
  event_id        TEXT PRIMARY KEY,
  ts              INTEGER NOT NULL,
  device_id       TEXT NOT NULL,
  library         TEXT,
  kind            TEXT NOT NULL,
  provider_id     TEXT NOT NULL,
  provider_name   TEXT,
  model           TEXT NOT NULL,
  feature         TEXT NOT NULL,
  scope           TEXT,
  session_id      TEXT,
  entity_id       TEXT,
  status          TEXT NOT NULL,
  error_message   TEXT,
  latency_ms      INTEGER,
  ttft_ms         INTEGER,
  input_tokens    INTEGER NOT NULL DEFAULT 0,
  output_tokens   INTEGER NOT NULL DEFAULT 0,
  cache_read      INTEGER NOT NULL DEFAULT 0,
  cache_write     INTEGER NOT NULL DEFAULT 0,
  reasoning       INTEGER NOT NULL DEFAULT 0,
  total_tokens    INTEGER NOT NULL DEFAULT 0,
  units           REAL,
  cost            REAL NOT NULL DEFAULT 0,
  cost_source     TEXT NOT NULL DEFAULT 'none'
);
CREATE INDEX IF NOT EXISTS idx_mue_ts ON model_usage_event(ts);
CREATE INDEX IF NOT EXISTS idx_mue_model_ts ON model_usage_event(model, ts);
CREATE INDEX IF NOT EXISTS idx_mue_feature_ts ON model_usage_event(feature, ts);
CREATE INDEX IF NOT EXISTS idx_mue_library_ts ON model_usage_event(library, ts);
`;

interface EventRow {
  event_id: string;
  ts: number;
  device_id: string;
  library: string | null;
  kind: ModelUsageEvent["kind"];
  provider_id: string;
  provider_name: string | null;
  model: string;
  feature: string;
  scope: string | null;
  session_id: string | null;
  entity_id: string | null;
  status: ModelUsageEvent["status"];
  error_message: string | null;
  latency_ms: number | null;
  ttft_ms: number | null;
  input_tokens: number;
  output_tokens: number;
  cache_read: number;
  cache_write: number;
  reasoning: number;
  total_tokens: number;
  units: number | null;
  cost: number;
  cost_source: ModelUsageEvent["costSource"];
}

const toRow = (event: ModelUsageEvent): EventRow => ({
  event_id: event.eventId,
  ts: event.ts,
  device_id: event.deviceId,
  library: event.library,
  kind: event.kind,
  provider_id: event.providerId,
  provider_name: event.providerName,
  model: event.model,
  feature: event.feature,
  scope: event.scope,
  session_id: event.sessionId,
  entity_id: event.entityId,
  status: event.status,
  error_message: event.errorMessage,
  latency_ms: event.latencyMs,
  ttft_ms: event.ttftMs,
  input_tokens: event.inputTokens,
  output_tokens: event.outputTokens,
  cache_read: event.cacheReadTokens,
  cache_write: event.cacheWriteTokens,
  reasoning: event.reasoningTokens,
  total_tokens: event.totalTokens,
  units: event.units,
  cost: event.cost,
  cost_source: event.costSource,
});

const fromRow = (row: EventRow): ModelUsageEvent => ({
  eventId: row.event_id,
  ts: row.ts,
  deviceId: row.device_id,
  library: row.library,
  kind: row.kind,
  providerId: row.provider_id,
  providerName: row.provider_name,
  model: row.model,
  feature: row.feature,
  scope: row.scope,
  sessionId: row.session_id,
  entityId: row.entity_id,
  status: row.status,
  errorMessage: row.error_message,
  latencyMs: row.latency_ms,
  ttftMs: row.ttft_ms,
  inputTokens: row.input_tokens,
  outputTokens: row.output_tokens,
  cacheReadTokens: row.cache_read,
  cacheWriteTokens: row.cache_write,
  reasoningTokens: row.reasoning,
  totalTokens: row.total_tokens,
  units: row.units,
  cost: row.cost,
  costSource: row.cost_source,
});

const buildWhere = (query: ModelUsageQuery) => {
  const clauses: string[] = [];
  const params: Record<string, string | number> = {};
  if (query.from !== undefined) {
    clauses.push("ts >= @from");
    params.from = query.from;
  }
  if (query.to !== undefined) {
    clauses.push("ts < @to");
    params.to = query.to;
  }
  if (query.library !== undefined) {
    clauses.push("library = @library");
    params.library = query.library;
  }
  if (query.feature !== undefined) {
    clauses.push("feature = @feature");
    params.feature = query.feature;
  }
  if (query.model !== undefined) {
    clauses.push("model = @model");
    params.model = query.model;
  }
  if (query.status !== undefined) {
    clauses.push("status = @status");
    params.status = query.status;
  }
  return { where: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "", params };
};

/** usage.db 读写：全局一份，不随知识库快照同步 */
export class ModelUsageStore {
  private readonly insertStmt: Database.Statement;

  constructor(private readonly db: Database.Database) {
    db.exec(SCHEMA_SQL);
    if (this.getMeta("schema_version") === null) {
      this.setMeta("schema_version", String(USAGE_SCHEMA_VERSION));
    }
    // OR IGNORE：同一事件重复写入（以后跨设备导入）按主键去重
    this.insertStmt = db.prepare(`
      INSERT OR IGNORE INTO model_usage_event (
        event_id, ts, device_id, library, kind, provider_id, provider_name, model, feature,
        scope, session_id, entity_id, status, error_message, latency_ms, ttft_ms,
        input_tokens, output_tokens, cache_read, cache_write, reasoning, total_tokens,
        units, cost, cost_source
      ) VALUES (
        @event_id, @ts, @device_id, @library, @kind, @provider_id, @provider_name, @model, @feature,
        @scope, @session_id, @entity_id, @status, @error_message, @latency_ms, @ttft_ms,
        @input_tokens, @output_tokens, @cache_read, @cache_write, @reasoning, @total_tokens,
        @units, @cost, @cost_source
      )
    `);
  }

  getMeta(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM usage_meta WHERE key = ?").get(key) as
      { value: string } | undefined;
    return row?.value ?? null;
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare(
        "INSERT INTO usage_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      )
      .run(key, value);
  }

  insertMany(events: ModelUsageEvent[]): void {
    if (events.length === 0) return;
    this.db.transaction((batch: ModelUsageEvent[]) => {
      for (const event of batch) this.insertStmt.run(toRow(event));
    })(events);
  }

  summary(query: ModelUsageQuery = {}): ModelUsageSummary {
    const { where, params } = buildWhere(query);
    const row = this.db
      .prepare(
        `SELECT
           COUNT(*) AS calls,
           COALESCE(SUM(status = 'error'), 0) AS errors,
           COALESCE(SUM(status = 'aborted'), 0) AS aborted,
           COALESCE(SUM(input_tokens), 0) AS inputTokens,
           COALESCE(SUM(output_tokens), 0) AS outputTokens,
           COALESCE(SUM(cache_read), 0) AS cacheReadTokens,
           COALESCE(SUM(cache_write), 0) AS cacheWriteTokens,
           COALESCE(SUM(total_tokens), 0) AS totalTokens,
           COALESCE(SUM(cost), 0) AS cost
         FROM model_usage_event ${where}`
      )
      .get(params) as ModelUsageSummary;
    return row;
  }

  /** 按时间分桶 × 维度聚合（趋势图）；桶按调用方给的时区偏移对齐本地整点 / 零点 */
  timeseries(query: ModelUsageTimeseriesQuery): ModelUsageTimeseriesPoint[] {
    const { where, params } = buildWhere(query);
    const bucketMs = query.bucket === "hour" ? HOUR_MS : DAY_MS;
    const offsetMs = Math.trunc(query.tzOffsetMinutes) * 60_000;
    const column = DIMENSION_COLUMNS[query.groupBy];
    return this.db
      .prepare(
        `SELECT
           -- 绑定参数进来是 REAL，不强转会变成浮点除法、分桶失效
           (CAST((ts + @offsetMs) AS INTEGER) / CAST(@bucketMs AS INTEGER)) * CAST(@bucketMs AS INTEGER)
             - CAST(@offsetMs AS INTEGER) AS bucketStart,
           COALESCE(${column}, '') AS key,
           COUNT(*) AS calls,
           COALESCE(SUM(total_tokens), 0) AS totalTokens,
           COALESCE(SUM(cost), 0) AS cost
         FROM model_usage_event ${where}
         GROUP BY bucketStart, key
         ORDER BY bucketStart ASC, key ASC`
      )
      .all({ ...params, offsetMs, bucketMs }) as ModelUsageTimeseriesPoint[];
  }

  /** 单维度排行（按费用、再按 token 倒序） */
  breakdown(query: ModelUsageBreakdownQuery): ModelUsageBreakdownRow[] {
    const { where, params } = buildWhere(query);
    const column = DIMENSION_COLUMNS[query.groupBy];
    // 服务商的展示名取最近一条记录的名字（服务商改名后跟随最新）
    const label =
      query.groupBy === "provider"
        ? "COALESCE((SELECT provider_name FROM model_usage_event AS latest WHERE latest.provider_id = model_usage_event.provider_id AND latest.provider_name IS NOT NULL ORDER BY latest.ts DESC LIMIT 1), provider_id)"
        : `COALESCE(${column}, '')`;
    return this.db
      .prepare(
        `SELECT
           COALESCE(${column}, '') AS key,
           ${label} AS label,
           COUNT(*) AS calls,
           COALESCE(SUM(status = 'error'), 0) AS errors,
           COALESCE(SUM(input_tokens), 0) AS inputTokens,
           COALESCE(SUM(output_tokens), 0) AS outputTokens,
           COALESCE(SUM(total_tokens), 0) AS totalTokens,
           COALESCE(SUM(cost), 0) AS cost,
           AVG(latency_ms) AS avgLatencyMs,
           AVG(ttft_ms) AS avgTtftMs
         FROM model_usage_event ${where}
         GROUP BY key
         ORDER BY cost DESC, totalTokens DESC, calls DESC`
      )
      .all(params) as ModelUsageBreakdownRow[];
  }

  /* ── 跨设备同步用 ── */

  /** 某设备的全部事件，按主键升序逐条产出（导出 / 算哈希时不一次性载入内存） */
  *iterateDevice(deviceId: string, from?: number, to?: number): Generator<ModelUsageEvent> {
    const rows = this.db
      .prepare(
        `SELECT * FROM model_usage_event
         WHERE device_id = @deviceId
           AND (@from IS NULL OR ts >= @from) AND (@to IS NULL OR ts < @to)
         ORDER BY event_id ASC`
      )
      .iterate({ deviceId, from: from ?? null, to: to ?? null }) as IterableIterator<EventRow>;
    for (const row of rows) yield fromRow(row);
  }

  /** 用远端分段整体替换某设备某时间段的事件（分段是该设备该月的权威副本） */
  replaceDeviceRange(deviceId: string, from: number, to: number, events: ModelUsageEvent[]): void {
    this.db.transaction(() => {
      this.db
        .prepare("DELETE FROM model_usage_event WHERE device_id = ? AND ts >= ? AND ts < ?")
        .run(deviceId, from, to);
      for (const event of events) this.insertStmt.run(toRow(event));
    })();
  }

  /** 删除某设备的事件；给了时间段只删该段 */
  deleteDevice(deviceId: string, from?: number, to?: number): number {
    if (from === undefined || to === undefined) {
      return this.db.prepare("DELETE FROM model_usage_event WHERE device_id = ?").run(deviceId)
        .changes;
    }
    return this.db
      .prepare("DELETE FROM model_usage_event WHERE device_id = ? AND ts >= ? AND ts < ?")
      .run(deviceId, from, to).changes;
  }

  /** 每台设备的事件数与最近一次调用时间 */
  deviceStats(): Array<{ deviceId: string; events: number; lastTs: number }> {
    return this.db
      .prepare(
        `SELECT device_id AS deviceId, COUNT(*) AS events, MAX(ts) AS lastTs
         FROM model_usage_event GROUP BY device_id`
      )
      .all() as Array<{ deviceId: string; events: number; lastTs: number }>;
  }

  /** 按前缀读取 meta（同步标记、设备名等） */
  metaWithPrefix(prefix: string): Record<string, string> {
    const rows = this.db
      .prepare("SELECT key, value FROM usage_meta WHERE key >= ? AND key < ?")
      .all(prefix, `${prefix}￿`) as Array<{ key: string; value: string }>;
    return Object.fromEntries(rows.map(row => [row.key, row.value]));
  }

  deleteMeta(key: string): void {
    this.db.prepare("DELETE FROM usage_meta WHERE key = ?").run(key);
  }

  deleteMetaWithPrefix(prefix: string): void {
    this.db.prepare("DELETE FROM usage_meta WHERE key >= ? AND key < ?").run(prefix, `${prefix}￿`);
  }

  list(query: ModelUsageQuery = {}): ModelUsageListResult {
    const { where, params } = buildWhere(query);
    const limit = Math.min(Math.max(Math.trunc(query.limit ?? 50), 1), MAX_LIST_LIMIT);
    const offset = Math.max(Math.trunc(query.offset ?? 0), 0);
    const { total } = this.db
      .prepare(`SELECT COUNT(*) AS total FROM model_usage_event ${where}`)
      .get(params) as { total: number };
    const rows = this.db
      .prepare(
        `SELECT * FROM model_usage_event ${where}
         ORDER BY ts DESC, event_id DESC LIMIT @limit OFFSET @offset`
      )
      .all({ ...params, limit, offset }) as EventRow[];
    return { total, items: rows.map(fromRow) };
  }
}
