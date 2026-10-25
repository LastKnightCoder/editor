// 数据库同步中心的状态推导：把版本对比翻译成用户语言与主按钮方向（纯函数，便于单测）。
// 版本号只反映「谁上传过新快照」，不追踪本机未上传的编辑，因此版本相等时主按钮仍是「立即同步」（上传）。

import type { SyncVersionResponse } from "../../../types";

export type SyncTone = "ok" | "warn" | "run" | "error" | "idle";
/** 主按钮动作：upload/download 指明方向，smart 交给智能同步按版本选择 */
export type SyncPrimaryAction = "upload" | "download" | "smart" | "check";

export type SyncHeroState = {
  tone: SyncTone;
  icon: "check" | "upload" | "download" | "sync" | "error" | "cloud";
  title: string;
  description: string;
  primaryLabel: string;
  primaryAction: SyncPrimaryAction;
  /** 已是最新时主按钮降为次级样式 */
  primaryEmphasis: boolean;
};

export type SyncHeroInput = {
  versions: SyncVersionResponse | null;
  syncing: boolean;
  checking: boolean;
  errorMessage: string | null;
};

export function deriveSyncHero(input: SyncHeroInput): SyncHeroState {
  if (input.syncing) {
    return {
      tone: "run",
      icon: "sync",
      title: "正在同步…",
      description: "可以离开此页，完成后会提示",
      primaryLabel: "同步中",
      primaryAction: "smart",
      primaryEmphasis: false,
    };
  }
  if (input.errorMessage) {
    return {
      tone: "error",
      icon: "error",
      title: "连接失败",
      description: input.errorMessage,
      primaryLabel: "重试",
      primaryAction: "check",
      primaryEmphasis: false,
    };
  }
  const versions = input.versions;
  if (!versions) {
    return {
      tone: "idle",
      icon: "cloud",
      title: input.checking ? "正在检查云端…" : "尚未检查",
      description: "检查云端是否有其他设备的新版本",
      primaryLabel: "检查云端",
      primaryAction: "check",
      primaryEmphasis: true,
    };
  }
  if (versions.localVersion === 0 && versions.remoteVersion === 0) {
    return {
      tone: "idle",
      icon: "upload",
      title: "尚未同步",
      description: "云端还没有数据，上传本机数据库后其他设备即可下载",
      primaryLabel: "上传本机数据库",
      primaryAction: "upload",
      primaryEmphasis: true,
    };
  }
  if (versions.remoteVersion > versions.localVersion) {
    return {
      tone: "warn",
      icon: "download",
      title: "云端有更新",
      description: "其他设备上传了新版本，下载后即可看到",
      primaryLabel: "下载更新",
      primaryAction: "download",
      primaryEmphasis: true,
    };
  }
  if (versions.localVersion > versions.remoteVersion) {
    return {
      tone: "warn",
      icon: "upload",
      title: "本机版本更新",
      description: "上传后其他设备即可看到",
      primaryLabel: "上传改动",
      primaryAction: "upload",
      primaryEmphasis: true,
    };
  }
  return {
    tone: "ok",
    icon: "check",
    title: "已是最新",
    description: "云端没有其他设备的新版本",
    primaryLabel: "立即同步",
    primaryAction: "smart",
    primaryEmphasis: false,
  };
}

/** 整库覆盖能否执行；覆盖较新一侧时不拦截，只给出确认时的警示 */
export function overwriteAvailability(
  versions: SyncVersionResponse | null,
  direction: "upload" | "download"
): { enabled: boolean; reason: string | null; warning: string | null } {
  if (!versions) {
    return { enabled: false, reason: "请先检查云端版本", warning: null };
  }
  if (direction === "download" && versions.remoteVersion === 0) {
    return { enabled: false, reason: "云端还没有数据", warning: null };
  }
  if (direction === "upload" && versions.remoteVersion > versions.localVersion) {
    return { enabled: true, reason: null, warning: "云端版本比本机新，其他设备上传的修改会丢失。" };
  }
  if (direction === "download" && versions.localVersion > versions.remoteVersion) {
    return { enabled: true, reason: null, warning: "本机版本比云端新，本机未上传的修改会丢失。" };
  }
  return { enabled: true, reason: null, warning: null };
}

const LAST_SYNC_STORAGE_KEY = "tau.mobile.lastDatabaseSync";

/** 上次成功同步时间只在本机记录，按数据库名区分 */
export function readLastSyncTime(databaseName: string): number | null {
  try {
    const raw = window.localStorage.getItem(LAST_SYNC_STORAGE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const value = map[databaseName];
    return typeof value === "number" && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function writeLastSyncTime(databaseName: string, time: number): void {
  try {
    const raw = window.localStorage.getItem(LAST_SYNC_STORAGE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    map[databaseName] = time;
    window.localStorage.setItem(LAST_SYNC_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // 存储不可用时只是不显示上次同步时间
  }
}

export function formatRelativeTime(time: number, now: number): string {
  const diff = Math.max(0, now - time);
  const minute = 60_000;
  if (diff < minute) return "刚刚";
  if (diff < 60 * minute) return `${Math.floor(diff / minute)} 分钟前`;
  const date = new Date(time);
  const today = new Date(now);
  const hhmm = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  if (date.toDateString() === today.toDateString()) return `今天 ${hhmm}`;
  const yesterday = new Date(now - 86_400_000);
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${hhmm}`;
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${hhmm}`;
}
