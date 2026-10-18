import type { ISyncProvider } from "./types.js";
import { readSettings } from "../settings.js";
import { AliOSSSyncProvider } from "./alioss.js";
import { PluginSyncProvider } from "./plugin.js";
import { WebDavSyncProvider } from "./webdav.js";
import { GithubSyncProvider } from "./github.js";

export function createSyncProvider(): ISyncProvider | null {
  const settings = readSettings();
  const syncConfig = settings.sync;
  const integration = settings.integration;
  if (syncConfig.active === "s3")
    throw new Error("请先启动新版桌面客户端，完成 S3 插件安装与配置升级");

  switch (syncConfig.active) {
    case "aliOSS": {
      const accessKeyId = (syncConfig.aliOSS as any).accessKeyId || integration.aliOSS.accessKeyId;
      const accessKeySecret =
        (syncConfig.aliOSS as any).accessKeySecret || integration.aliOSS.accessKeySecret;
      const { bucket, region, path } = syncConfig.aliOSS;
      if (!accessKeyId || !accessKeySecret || !bucket || !region) return null;
      return new AliOSSSyncProvider({
        accessKeyId,
        accessKeySecret,
        bucket,
        region,
        path,
      });
    }

    case "plugin": {
      const target = syncConfig.plugin;
      if (!target?.id || !Object.hasOwn(target.configurations, target.id)) return null;
      return new PluginSyncProvider(target.id, structuredClone(target.configurations[target.id]));
    }

    case "webdav": {
      const { url, username, password } = integration.webdav;
      const { pathPrefix } = syncConfig.webdav;
      if (!url || !username || !password) return null;
      return new WebDavSyncProvider({ url, username, password, pathPrefix });
    }

    case "github": {
      const { token, user } = integration.github;
      const { repo, branch, pathPrefix } = syncConfig.github;
      if (!token || !repo || !branch || !user.name) return null;
      return new GithubSyncProvider({
        token,
        repo,
        branch,
        path: pathPrefix,
        user,
      });
    }

    default:
      return null;
  }
}

export type { ISyncProvider, IDatabaseInfo } from "./types.js";
