import { ESync } from "@/stores/useSettingStore";
import type { ISetting } from "@/stores/useSettingStore";

type SyncConfig = ISetting["sync"];

export const isSyncConfigured = (active: ESync, sync: SyncConfig) => {
  switch (active) {
    case ESync.Plugin:
      return (
        !!sync.plugin?.id &&
        Object.hasOwn(sync.plugin.configurations, sync.plugin.id) &&
        sync.plugin.configurations[sync.plugin.id] != null
      );
    default:
      return false;
  }
};
