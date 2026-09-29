import type Database from "better-sqlite3";
import type {
  ModelUsageEvent,
  ModelUsageListResult,
  ModelUsageQuery,
  ModelUsageSummary,
} from "@/types/model-usage";

export const USAGE_SCHEMA_VERSION = 1;
const MAX_LIST_LIMIT = 500;

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
