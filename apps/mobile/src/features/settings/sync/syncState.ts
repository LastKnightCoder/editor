// 数据库同步中心的状态推导：把版本对比翻译成用户语言与主按钮方向（纯函数，便于单测）。
// 版本号只反映「谁上传过新快照」，不追踪本机未上传的编辑，因此版本相等时主按钮仍是「立即同步」（上传）。

import type { SyncLocale } from "./i18n";
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

export function deriveSyncHero(input: SyncHeroInput, language: SyncLocale): SyncHeroState {
  const { t } = language;
  if (input.syncing) {
    return {
      tone: "run",
      icon: "sync",
      title: t("hero.syncing"),
      description: t("hero.background"),
      primaryLabel: t("status.syncing"),
      primaryAction: "smart",
      primaryEmphasis: false,
    };
  }
  if (input.errorMessage) {
    return {
      tone: "error",
      icon: "error",
      title: t("hero.connectionFailed"),
      description: input.errorMessage,
      primaryLabel: t("action.retry"),
      primaryAction: "check",
      primaryEmphasis: false,
    };
  }
  const versions = input.versions;
  if (!versions) {
    return {
      tone: "idle",
      icon: "cloud",
      title: input.checking ? t("hero.checking") : t("hero.unchecked"),
      description: t("hero.checkHint"),
      primaryLabel: t("action.checkCloud"),
      primaryAction: "check",
      primaryEmphasis: true,
    };
  }
  if (versions.localVersion === 0 && versions.remoteVersion === 0) {
    return {
      tone: "idle",
      icon: "upload",
      title: t("hero.notSynced"),
      description: t("hero.noRemoteHint"),
      primaryLabel: t("action.uploadLocal"),
      primaryAction: "upload",
      primaryEmphasis: true,
    };
  }
  if (versions.remoteVersion > versions.localVersion) {
    return {
      tone: "warn",
      icon: "download",
      title: t("hero.remoteNewer"),
      description: t("hero.remoteNewerHint"),
      primaryLabel: t("action.downloadUpdate"),
      primaryAction: "download",
      primaryEmphasis: true,
    };
  }
  if (versions.localVersion > versions.remoteVersion) {
    return {
      tone: "warn",
      icon: "upload",
      title: t("hero.localNewer"),
      description: t("hero.localNewerHint"),
      primaryLabel: t("action.uploadChanges"),
      primaryAction: "upload",
      primaryEmphasis: true,
    };
  }
  return {
    tone: "ok",
    icon: "check",
    title: t("status.latest"),
    description: t("hero.latestHint"),
    primaryLabel: t("action.syncNow"),
    primaryAction: "smart",
    primaryEmphasis: false,
  };
}

/** 整库覆盖能否执行；覆盖较新一侧时不拦截，只给出确认时的警示 */
export function overwriteAvailability(
  versions: SyncVersionResponse | null,
  direction: "upload" | "download",
  language: SyncLocale
): { enabled: boolean; reason: string | null; warning: string | null } {
  const { t } = language;
  if (!versions) {
    return { enabled: false, reason: t("overwrite.checkFirst"), warning: null };
  }
  if (direction === "download" && versions.remoteVersion === 0) {
    return { enabled: false, reason: t("overwrite.remoteEmpty"), warning: null };
  }
  if (direction === "upload" && versions.remoteVersion > versions.localVersion) {
    return { enabled: true, reason: null, warning: t("overwrite.remoteNewerWarning") };
  }
  if (direction === "download" && versions.localVersion > versions.remoteVersion) {
    return { enabled: true, reason: null, warning: t("overwrite.localNewerWarning") };
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
