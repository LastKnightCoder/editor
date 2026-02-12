import type {
  DatabaseListResponse,
  ResourceSyncProgress,
  ResourceSyncStatusFile,
  SettingCompat,
  SyncVersionResponse,
} from "../../../types";

export type SettingModule =
  | "theme"
  | "database"
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
  onSwitchDatabase: (name: string) => Promise<void>;
  onSaveSetting: () => Promise<void>;
  onCheckVersions: () => Promise<SyncVersionResponse>;
  onSyncUpload: () => Promise<void>;
  onSyncDownload: () => Promise<void>;
  onResourceSyncRefresh: () => Promise<void>;
  onResourceSyncStart: () => Promise<void>;
  onResourceSyncRetryFailed: () => Promise<void>;
  onResourceSyncCancel: () => Promise<void>;
  updateSetting: (updater: (prev: SettingCompat) => SettingCompat) => void;
};
