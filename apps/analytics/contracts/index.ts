export const SCHEMA_VERSION = 1;
export const MAX_BATCH_EVENTS = 50;
export const MAX_BODY_BYTES = 64 * 1024;
export const EVENT_TTL_MS = 7 * 86400000;

export interface EventContext {
  app_version: string;
  os: string;
  arch: string;
  locale: string;
}

export type EventProperties = Record<string, string | number | boolean>;

export interface AnalyticsEvent {
  event_id: string;
  session_id: string;
  name: string;
  event_version: number;
  occurred_at: string;
  context: EventContext;
  properties: EventProperties;
}

export interface EventBatch {
  schema_version: 1;
  product: string;
  environment: "production" | "development";
  installation_id: string;
  events: AnalyticsEvent[];
}

export interface BatchReceipt {
  accepted: string[];
  rejected: {
    index: number;
    event_id: string | null;
    code: string;
    retryable: boolean;
  }[];
  received_at: string;
}

export interface QueryMeta {
  timezone: "Asia/Shanghai";
  metric_version: 1;
  from: string;
  to: string;
  product: string;
  environment: string;
  raw_retention_days: 30;
  aggregate_retention_days: 400;
}

export interface Overview {
  active_installations: number;
  new_installations: number;
  events: number;
  sessions: number;
  foreground_ms: number;
  crashes: number;
  download_starts: number;
}

export interface TrendRow {
  day: string;
  active_installations: number;
  new_installations: number;
  events: number;
  download_starts: number;
}

export interface BreakdownRow {
  key: string;
  label: string;
  count: number;
}

export interface RetentionRow {
  day: string;
  installations: number;
  d1: number | null;
  d7: number | null;
  d30: number | null;
}

export interface EventRow {
  event_id: string;
  name: string;
  event_version: number;
  occurred_at: number;
  received_at: number;
  app_version: string;
  country: string;
  region_code: string;
  properties: EventProperties;
}
