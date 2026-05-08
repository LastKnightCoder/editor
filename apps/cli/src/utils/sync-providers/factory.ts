import type { ISyncProvider } from "./types.js";
import { readSettings } from "../settings.js";
import { AliOSSSyncProvider } from "./alioss.js";
import { S3SyncProvider } from "./s3.js";
import { WebDavSyncProvider } from "./webdav.js";
import { GithubSyncProvider } from "./github.js";

export function createSyncProvider(): ISyncProvider | null {
  const settings = readSettings();
  const syncConfig = settings.sync;
  const integration = settings.integration;

  switch (syncConfig.active) {
    case "aliOSS": {
      const accessKeyId =
        (syncConfig.aliOSS as any).accessKeyId ||
        integration.aliOSS.accessKeyId;
      const accessKeySecret =
        (syncConfig.aliOSS as any).accessKeySecret ||
        integration.aliOSS.accessKeySecret;
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

    case "s3": {
      const { accessKeyId, secretAccessKey, endpoint, urlStyle } =
        integration.s3;
      const { bucket, region, pathPrefix } = syncConfig.s3;
      if (!accessKeyId || !secretAccessKey || !bucket || !region) return null;
      return new S3SyncProvider({
        accessKeyId,
        secretAccessKey,
        bucket,
        region,
        endpoint,
        urlStyle,
        pathPrefix,
      });
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
