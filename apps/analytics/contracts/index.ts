export const REPORT_TTL_MS = 7 * 86400000;

export interface VersionObservation {
  app_version: string;
  reported_at: string;
}

export interface VersionReport extends VersionObservation {
  schema_version: 1;
  product: "tau-desktop";
  environment: "production" | "development";
  installation_id: string;
}

export interface QueryMeta {
  timezone: "Asia/Shanghai";
  metric_version: 2;
  from: string;
  to: string;
  product: string;
  environment: string;
  aggregate_retention_days: 400;
}

export interface Overview {
  reporting_installations: number;
  download_starts: number;
}

export interface TrendRow {
  day: string;
  reporting_installations: number;
  download_starts: number;
}

export interface BreakdownRow {
  key: string;
  label: string;
  count: number;
}
