// 资源文件同步的状态推导：只看本轮的文件账本（statusFile）与运行中的进度，
// 翻译成状态卡、主按钮与同步中心那一行的徽标（纯函数，便于单测）。

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

export function deriveResourceHero(input: {
  progress: ResourceSyncProgress | null;
  counts: ResourceCounts;
  errorMessage: string | null;
  configMissing: boolean;
  lastSyncText: string | null;
}): ResourceHeroState {
  const { progress, counts } = input;
  if (isResourceSyncRunning(progress) && progress) {
    const percent =
      progress.totalFiles > 0
        ? Math.round((progress.processedFiles / progress.totalFiles) * 100)
        : 0;
    return {
      tone: "run",
      icon: "sync",
      title: progress.status === "scanning" ? "正在比对文件…" : `正在同步 ${percent}%`,
      description: `已处理 ${progress.processedFiles} / ${progress.totalFiles} · 可以离开此页，同步会在后台继续`,
      primaryLabel: "停止",
      primaryAction: "cancel",
      primaryEmphasis: false,
    };
  }
  if (input.configMissing) {
    return {
      tone: "idle",
      icon: "cloud",
      title: "还没有设置同步服务",
      description: "资源文件跟随数据库同步使用同一个服务",
      primaryLabel: "设置同步",
      primaryAction: "configure",
      primaryEmphasis: true,
    };
  }
  if (input.errorMessage) {
    return {
      tone: "error",
      icon: "error",
      title: "连接失败",
      description: input.errorMessage,
      primaryLabel: "重试",
      primaryAction: "refresh",
      primaryEmphasis: true,
    };
  }
  const since = input.lastSyncText ? `上次同步 ${input.lastSyncText}` : "";
  if (counts.error > 0) {
    return {
      tone: "error",
      icon: "error",
      title: `${counts.error} 个文件同步失败`,
      description: [`其余 ${counts.total - counts.error} 个正常`, since]
        .filter(Boolean)
        .join(" · "),
      primaryLabel: `重试 ${counts.error} 个文件`,
      primaryAction: "retry",
      primaryEmphasis: true,
    };
  }
  const pending = counts.upload + counts.download;
  if (pending > 0) {
    const parts = [
      counts.upload > 0 ? `本机新增 ${counts.upload} 个` : "",
      counts.download > 0 ? `云端新增 ${counts.download} 个` : "",
    ].filter(Boolean);
    return {
      tone: "warn",
      icon: "upload",
      title: `有 ${pending} 个文件待同步`,
      description: [parts.join(" · "), since].filter(Boolean).join("，"),
      primaryLabel: "开始同步",
      primaryAction: "start",
      primaryEmphasis: true,
    };
  }
  if (counts.total === 0) {
    return {
      tone: "idle",
      icon: "cloud",
      title: "还没有资源文件",
      description: "保存在本机的图片和附件会在这里同步",
      primaryLabel: "检查云端",
      primaryAction: "refresh",
      primaryEmphasis: false,
    };
  }
  return {
    tone: "ok",
    icon: "check",
    title: "已同步",
    description: [`${counts.total} 个文件`, since].filter(Boolean).join(" · "),
    primaryLabel: "立即同步",
    primaryAction: "start",
    primaryEmphasis: false,
  };
}

/** 同步中心「资源文件」行右侧的徽标，没什么要提醒时返回 null */
export function resourceBadge(
  progress: ResourceSyncProgress | null,
  counts: ResourceCounts
): { tone: "warn" | "danger" | "info"; text: string } | null {
  if (isResourceSyncRunning(progress)) return { tone: "info", text: "同步中" };
  if (counts.error > 0) return { tone: "danger", text: `${counts.error} 个失败` };
  const pending = counts.upload + counts.download;
  if (pending > 0) return { tone: "warn", text: `${pending} 个待同步` };
  return null;
}
