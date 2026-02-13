import type {
  DatabaseListResponse,
  ResourceSyncActionResponse,
  ResourceSyncProgress,
  ResourceSyncStatusFile,
  SettingCompat,
  SyncActionResponse,
  SyncVersionResponse,
} from "../../../types";

export type SettingModule =
  | "theme"
  | "about"
  | "database"
  | "sync-status-db"
  | "sync-status-resource"
  | "integration"
  | "integration-github"
  | "integration-s3"
  | "integration-webdav"
  | "integration-alioss"
  | "resource"
  | "resource-local"
  | "resource-github"
  | "resource-alioss"
  | "resource-s3"
  | "resource-webdav"
  | "sync-webdav"
  | "sync-alioss"
  | "sync-github"
  | "sync-s3"
  | null;

export type SettingsPageProps = {
  safeSetting: SettingCompat | null;
  databases: DatabaseListResponse | null;
  versions: SyncVersionResponse | null;
  isSavingSetting: boolean;
  isSyncing: boolean;
  resourceSyncProgress: ResourceSyncProgress;
  resourceSyncStatusFile: ResourceSyncStatusFile | null;
  isResourceSyncing: boolean;
  onBack: () => void;
  activeModule: SettingModule;
  onActiveModuleChange: (module: SettingModule) => void;
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
    options?: { persist?: boolean },
  ) => void;
};
