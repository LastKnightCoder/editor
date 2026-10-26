import type {
  DatabaseListResponse,
  ResourceSyncActionResponse,
  ResourceSyncProgress,
  ResourceSyncStatusFile,
  SettingCompat,
  SyncActionResponse,
  SyncVersionResponse,
} from "../../../types";

/** 设置二级模块键：单一事实来源，同时驱动 SettingModule 类型与 settingsModule 页参数校验 */
export const SETTINGS_MODULE_KEYS = [
  "about",
  "database",
  "databases",
  "sync-overwrite",
  "collaboration",
  "sync-status-resource",
  "resource",
  "voice",
  "speech-input",
] as const;

export type SettingModule = (typeof SETTINGS_MODULE_KEYS)[number] | null;
export type SettingModuleKey = Exclude<SettingModule, null>;

export type SettingsPageProps = {
  safeSetting: SettingCompat | null;
  databases: DatabaseListResponse | null;
  versions: SyncVersionResponse | null;
  isSavingSetting: boolean;
  isSyncing: boolean;
  resourceSyncProgress: ResourceSyncProgress;
  resourceSyncStatusFile: ResourceSyncStatusFile | null;
  isResourceSyncing: boolean;
  onSwitchDatabase: (name: string) => Promise<void>;
  onSaveSetting: () => Promise<void>;
  onCheckVersions: () => Promise<SyncVersionResponse>;
  onSyncUpload: () => Promise<SyncActionResponse>;
  onSyncDownload: () => Promise<SyncActionResponse>;
  onResourceSyncRefresh: () => Promise<void>;
  onResourceSyncStart: () => Promise<ResourceSyncActionResponse>;
  onResourceSyncRetryFailed: () => Promise<ResourceSyncActionResponse>;
  onResourceSyncCancel: () => Promise<ResourceSyncActionResponse>;
  updateSetting: (
    updater: (prev: SettingCompat) => SettingCompat,
    options?: { persist?: boolean }
  ) => void;
};
