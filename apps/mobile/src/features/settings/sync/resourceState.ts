// 资源文件同步的状态推导：只看本轮的文件账本（statusFile）与运行中的进度，
// 翻译成状态卡、主按钮与同步中心那一行的徽标（纯函数，便于单测）。

import type { SyncLocale } from "./i18n";
import type {
  ResourceFileSyncStatus,
  ResourceSyncProgress,
  ResourceSyncStatusFile,
} from "../../../types";
import type { SyncTone } from "./syncState";

export type ResourceFilter = "error" | "upload" | "download" | "all";
export type ResourceEntry = [path: string, status: ResourceFileSyncStatus];
export type ResourceCounts = { total: number; upload: number; download: number; error: number };

export type ResourcePrimaryAction = "start" | "retry" | "cancel" | "refresh" | "configure";

export type ResourceHeroState = {
  tone: SyncTone;
  icon: "check" | "upload" | "sync" | "error" | "cloud";
  title: string;
  description: string;
  primaryLabel: string;
  primaryAction: ResourcePrimaryAction;
  primaryEmphasis: boolean;
};

function isPending(status: ResourceFileSyncStatus, direction: "upload" | "download"): boolean {
  return status.syncDirection === direction && status.syncStatus !== "synced";
}

export function countResources(statusFile: ResourceSyncStatusFile | null): ResourceCounts {
  const counts: ResourceCounts = { total: 0, upload: 0, download: 0, error: 0 };
  for (const status of Object.values(statusFile?.files ?? {})) {
    counts.total += 1;
    if (status.syncStatus === "error") {
      counts.error += 1;
    } else if (isPending(status, "upload")) {
      counts.upload += 1;
    } else if (isPending(status, "download")) {
      counts.download += 1;
    }
  }
  return counts;
}

export function filterResources(
  statusFile: ResourceSyncStatusFile | null,
  filter: ResourceFilter
): ResourceEntry[] {
  const entries = Object.entries(statusFile?.files ?? {});
  const matched = entries.filter(([, status]) => {
    if (filter === "error") return status.syncStatus === "error";
    if (filter === "all") return true;
    return status.syncStatus !== "error" && isPending(status, filter);
  });
  return matched.sort(([a], [b]) => a.localeCompare(b));
}

/** 默认筛选：先给需要处理的，再给待同步的 */
export function defaultResourceFilter(counts: ResourceCounts): ResourceFilter {
  if (counts.error > 0) return "error";
  if (counts.upload > 0) return "upload";
  if (counts.download > 0) return "download";
  return "all";
}

export function isResourceSyncRunning(progress: ResourceSyncProgress | null): boolean {
  return progress?.status === "scanning" || progress?.status === "syncing";
}

export function resourceSummary(counts: ResourceCounts, language: SyncLocale): string {
  const { t, locale } = language;
  const synced = counts.total - counts.upload - counts.download - counts.error;
  return [
    t("summary.synced", { amount: synced.toLocaleString(locale), count: synced }),
    counts.upload > 0
      ? t("summary.upload", { amount: counts.upload.toLocaleString(locale), count: counts.upload })
      : "",
    counts.download > 0
      ? t("summary.download", {
          amount: counts.download.toLocaleString(locale),
          count: counts.download,
        })
      : "",
    counts.error > 0
      ? t("summary.failed", { amount: counts.error.toLocaleString(locale), count: counts.error })
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function deriveResourceHero(
  input: {
    progress: ResourceSyncProgress | null;
    counts: ResourceCounts;
    errorMessage: string | null;
    configMissing: boolean;
    lastSyncText: string | null;
    checked?: boolean;
  },
  language: SyncLocale
): ResourceHeroState {
  const { t, locale } = language;
  const { progress, counts } = input;
  if (isResourceSyncRunning(progress) && progress) {
    const percent =
      progress.totalFiles > 0
        ? Math.round((progress.processedFiles / progress.totalFiles) * 100)
        : 0;
    return {
      tone: "run",
      icon: "sync",
      title:
        progress.status === "scanning"
          ? t("resource.heroScanning")
          : t("resource.percent", { percent: percent }),
      description: t("resource.backgroundProgress", {
        processed: progress.processedFiles,
        total: progress.totalFiles,
      }),
      primaryLabel: t("action.stop"),
      primaryAction: "cancel",
      primaryEmphasis: false,
    };
  }
  if (input.configMissing) {
    return {
      tone: "idle",
      icon: "cloud",
      title: t("resource.noService"),
      description: t("resource.sharedService"),
      primaryLabel: t("resource.configure"),
      primaryAction: "configure",
      primaryEmphasis: true,
    };
  }
  const errorMessage = input.errorMessage || progress?.errorMessage;
  if (errorMessage || (progress?.status === "error" && counts.error === 0)) {
    return {
      tone: "error",
      icon: "error",
      title: t("resource.incomplete"),
      description: errorMessage || t("resource.errorHint"),
      primaryLabel: t("action.retry"),
      primaryAction: "refresh",
      primaryEmphasis: true,
    };
  }
  const since = input.lastSyncText ? t("resource.since", { time: input.lastSyncText }) : "";
  if (counts.error > 0) {
    return {
      tone: "error",
      icon: "error",
      title: t("resource.failedFiles", {
        amount: counts.error.toLocaleString(locale),
        count: counts.error,
      }),
      description: [resourceSummary(counts, language), since].filter(Boolean).join(" · "),
      primaryLabel: t("resource.retryFiles", {
        amount: counts.error.toLocaleString(locale),
        count: counts.error,
      }),
      primaryAction: "retry",
      primaryEmphasis: true,
    };
  }
  if (progress?.status === "cancelled") {
    return {
      tone: "warn",
      icon: "cloud",
      title: t("resource.stopped"),
      description: resourceSummary(counts, language),
      primaryLabel: t("resource.continue"),
      primaryAction: "start",
      primaryEmphasis: true,
    };
  }
  if (input.checked === false) {
    return {
      tone: "idle",
      icon: "cloud",
      title: t("resource.notChecked"),
      description: t("resource.checkHint"),
      primaryLabel: t("action.checkCloud"),
      primaryAction: "refresh",
      primaryEmphasis: true,
    };
  }
  const pending = counts.upload + counts.download;
  if (pending > 0) {
    const parts = [
      counts.upload > 0
        ? t("resource.localNew", {
            amount: counts.upload.toLocaleString(locale),
            count: counts.upload,
          })
        : "",
      counts.download > 0
        ? t("resource.remoteNew", {
            amount: counts.download.toLocaleString(locale),
            count: counts.download,
          })
        : "",
    ].filter(Boolean);
    return {
      tone: "warn",
      icon: "upload",
      title: t("resource.pendingFiles", { amount: pending.toLocaleString(locale), count: pending }),
      description: [parts.join(" · "), since]
        .filter(Boolean)
        .join(t("resource.descriptionSeparator")),
      primaryLabel: t("resource.start"),
      primaryAction: "start",
      primaryEmphasis: true,
    };
  }
  if (counts.total === 0) {
    return {
      tone: "idle",
      icon: "cloud",
      title: t("resource.empty"),
      description: t("resource.emptyHint"),
      primaryLabel: t("action.checkCloud"),
      primaryAction: "refresh",
      primaryEmphasis: false,
    };
  }
  return {
    tone: "ok",
    icon: "check",
    title: t("status.synced"),
    description: [
      t("resource.fileCount", { amount: counts.total.toLocaleString(locale), count: counts.total }),
      since,
    ]
      .filter(Boolean)
      .join(" · "),
    primaryLabel: t("action.syncNow"),
    primaryAction: "start",
    primaryEmphasis: false,
  };
}

/** 同步中心始终显示资源结果，尚未检查不能当作成功空集。 */
export function resourceBadge(
  progress: ResourceSyncProgress | null,
  counts: ResourceCounts,
  language: SyncLocale,
  checked = counts.total > 0
): { tone: "warn" | "danger" | "info" | "ok"; text: string } {
  const { t, locale } = language;
  if (isResourceSyncRunning(progress)) return { tone: "info", text: t("status.syncing") };
  if (progress?.errorMessage || (progress?.status === "error" && counts.error === 0)) {
    return { tone: "danger", text: t("status.error") };
  }
  if (counts.error > 0)
    return {
      tone: "danger",
      text: t("count.failed", { amount: counts.error.toLocaleString(locale), count: counts.error }),
    };
  if (progress?.status === "cancelled") return { tone: "warn", text: t("status.stopped") };
  if (!checked) return { tone: "info", text: t("status.unchecked") };
  const pending = counts.upload + counts.download;
  if (pending > 0)
    return {
      tone: "warn",
      text: t("count.pending", { amount: pending.toLocaleString(locale), count: pending }),
    };
  return { tone: "ok", text: counts.total > 0 ? t("resource.allSynced") : t("resource.noFiles") };
}
