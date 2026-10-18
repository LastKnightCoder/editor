import { ISyncProvider } from "@/types/sync";
import { GithubSyncProvider } from "./GithubSyncProvider";
import useSettingStore, { ESync } from "@/stores/useSettingStore";
import { PluginSyncProvider } from "./PluginSyncProvider";
import { copyJson } from "@tau/plugins/host";

export class SyncProviderFactory {
  static getSyncProvider(): ISyncProvider | null {
    const { setting } = useSettingStore.getState();
    const syncConfig = setting.sync;
    const integration = setting.integration;

    switch (syncConfig.active) {
      case ESync.Plugin:
        return syncConfig.plugin?.id &&
          Object.hasOwn(syncConfig.plugin.configurations, syncConfig.plugin.id)
          ? new PluginSyncProvider(
              syncConfig.plugin.id,
              copyJson(syncConfig.plugin.configurations[syncConfig.plugin.id])
            )
          : null;

      case ESync.Github: {
        const { token, user } = integration.github;
        const { repo, branch, pathPrefix } = syncConfig.github;
        if (!token || !repo || !branch || !user.name) {
          return null;
        }
        return new GithubSyncProvider({
          token,
          repo,
          branch,
          path: pathPrefix || "",
          user,
        });
      }

      default:
        return null;
    }
  }
}
