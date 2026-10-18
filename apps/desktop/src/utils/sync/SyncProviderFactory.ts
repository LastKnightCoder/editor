import { ISyncProvider } from "@/types/sync";
import useSettingStore, { ESync } from "@/stores/useSettingStore";
import { PluginSyncProvider } from "./PluginSyncProvider";
import { copyJson } from "@tau/plugins/host";

export class SyncProviderFactory {
  static getSyncProvider(): ISyncProvider | null {
    const { setting } = useSettingStore.getState();
    const syncConfig = setting.sync;

    switch (syncConfig.active) {
      case ESync.Plugin:
        return syncConfig.plugin?.id &&
          Object.hasOwn(syncConfig.plugin.configurations, syncConfig.plugin.id)
          ? new PluginSyncProvider(
              syncConfig.plugin.id,
              copyJson(syncConfig.plugin.configurations[syncConfig.plugin.id])
            )
          : null;

      default:
        return null;
    }
  }
}
