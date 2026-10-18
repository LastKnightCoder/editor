import { ESync } from "@/stores/useSettingStore";
import type { ISetting } from "@/stores/useSettingStore";

type SyncConfig = ISetting["sync"];
type IntegrationConfig = ISetting["integration"];

export const isSyncConfigured = (
  active: ESync,
  sync: SyncConfig,
  integration: IntegrationConfig
) => {
  switch (active) {
    case ESync.Plugin:
      return (
        !!sync.plugin?.id &&
        Object.hasOwn(sync.plugin.configurations, sync.plugin.id) &&
        sync.plugin.configurations[sync.plugin.id] != null
      );
    case ESync.AliOSS:
      return (
        !!integration.aliOSS.accessKeyId &&
        !!integration.aliOSS.accessKeySecret &&
        !!sync.aliOSS.bucket &&
        !!sync.aliOSS.region
      );
    case ESync.S3:
      return (
        !!integration.s3.accessKeyId &&
        !!integration.s3.secretAccessKey &&
        !!sync.s3.bucket &&
        !!sync.s3.region
      );
    case ESync.WebDav:
      return (
        !!integration.webdav.url && !!integration.webdav.username && !!integration.webdav.password
      );
    case ESync.Github:
      return !!integration.github.token && !!sync.github.repo && !!sync.github.branch;
    default:
      return false;
  }
};
