import { databaseSyncDisplay } from "./sync-progress.i18n.ts";

export type DatabaseSyncStatus =
  | {
      kind:
        | "prepare-sync"
        | "prepare-upload"
        | "prepare-download"
        | "check-local-sessions"
        | "create-snapshot"
        | "upload-database"
        | "upload-sessions"
        | "check-remote"
        | "verify-remote"
        | "publish-version"
        | "save-state"
        | "upload-complete"
        | "sync-complete"
        | "read-database-manifest"
        | "read-sessions-manifest"
        | "backup-database"
        | "replace-database"
        | "backup-replace"
        | "update-index-version"
        | "open-database"
        | "download-complete"
        | "prepare-remote-download";
    }
  | { kind: "upload-database-progress"; done: number; total: number }
  | { kind: "download-database"; done: number; total: number }
  | { kind: "upload-sessions-progress"; done: number; total: number; skipped: number }
  | { kind: "download-sessions"; done: number; total: number; reused: number; downloaded: number };
export interface DatabaseSyncProgress {
  value: number;
  status: DatabaseSyncStatus;
}
export function formatDatabaseSyncStatus(status: DatabaseSyncStatus, language = "zh-CN"): string {
  const { locale, t } = databaseSyncDisplay(language);
  const number = (value: number) => value.toLocaleString(locale);
  const mib = (bytes: number) =>
    (bytes / 1048576).toLocaleString(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  const bytes = (value: number) =>
    value < 1024
      ? `${number(value)} B`
      : value < 1048576
        ? `${(value / 1024).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KiB`
        : `${(value / 1048576).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MiB`;
  switch (status.kind) {
    case "upload-database-progress":
    case "download-database":
      return t(status.kind, { done: mib(status.done), total: mib(status.total) });
    case "upload-sessions-progress":
      return t(status.skipped > 0 ? "upload-sessions-progress-skipped" : status.kind, {
        done: number(status.done),
        total: number(status.total),
        skipped: number(status.skipped),
        count: status.skipped,
      });
    case "download-sessions":
      return t(status.kind, {
        done: number(status.done),
        total: number(status.total),
        reused: bytes(status.reused),
        downloaded: bytes(status.downloaded),
      });
    default:
      return t(status.kind);
  }
}
