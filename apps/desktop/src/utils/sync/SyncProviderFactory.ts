import { ISyncProvider } from "@/types/sync";
import { AliOSSSyncProvider } from "./AliOSSSyncProvider";
import { WebDavSyncProvider } from "./WebDavSyncProvider";
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
      case ESync.AliOSS: {
        const { accessKeyId, accessKeySecret } = integration.aliOSS;
        const { bucket, region, path } = syncConfig.aliOSS;
        if (!accessKeyId || !accessKeySecret || !bucket || !region) {
          return null;
        }
        return new AliOSSSyncProvider({
          accessKeyId,
          accessKeySecret,
          bucket,
          region,
          path: path || "/",
        });
      }

      case ESync.WebDav: {
        const { url, username, password } = integration.webdav;
        const { pathPrefix } = syncConfig.webdav;
        if (!url || !username || !password) {
          return null;
        }
        return new WebDavSyncProvider({
          url,
          username,
          password,
          pathPrefix: pathPrefix || "",
        });
      }

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
