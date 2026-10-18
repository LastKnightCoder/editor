import { LocalPluginPreferences } from "@tau/plugins/local-state";
import path from "node:path";
import { readFile, writeFile, rename, rm } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { pluginSyncStatusFile } from "./plugin-sync-status";

const migrations = [
  {
    key: "github",
    pluginId: "tau.sync-github",
    statusPrefix: "github",
    pathKey: "pathPrefix",
    defaultPath: "",
  },
  {
    key: "webdav",
    pluginId: "tau.sync-webdav",
    statusPrefix: "webdav",
    pathKey: "pathPrefix",
    defaultPath: "",
  },
  {
    key: "s3",
    pluginId: "tau.sync-s3",
    statusPrefix: "s3",
    pathKey: "pathPrefix",
    defaultPath: "",
  },
  {
    key: "aliOSS",
    pluginId: "tau.sync-oss",
    statusPrefix: "alioss",
    pathKey: "path",
    defaultPath: "/",
  },
] as const;
interface LegacyTarget {
  repo?: string;
  branch?: string;
  url?: string;
  username?: string;
  password?: string;
  bucket?: string;
  region?: string;
  pathPrefix?: string;
  path?: string;
  accessKeyId?: string;
  accessKeySecret?: string;
}
interface MigrationSettings {
  sync?: {
    active?: string;
    s3?: LegacyTarget;
    aliOSS?: LegacyTarget;
    webdav?: LegacyTarget;
    github?: LegacyTarget;
    plugin?: { id?: string; configurations?: Record<string, unknown> };
    [key: string]: unknown;
  };
  integration?: {
    s3?: Record<string, unknown>;
    aliOSS?: Record<string, unknown>;
    webdav?: Record<string, unknown>;
    github?: Record<string, unknown>;
  };
  [key: string]: unknown;
}

/** 仅升级旧配置；共享账号凭据仍由发布与资源上传消费。 */
export async function migrateSyncPluginSettings(
  setting: MigrationSettings,
  appDir: string,
  save: (setting: MigrationSettings) => Promise<void>
): Promise<MigrationSettings> {
  const sync = setting.sync;
  if (!sync) return setting;
  const pending = migrations.filter(
    item => Object.hasOwn(sync, item.key) || sync.active === item.key
  );
  if (!pending.length) return setting;
  const rest = { ...sync };
  const configurations = { ...sync.plugin?.configurations };
  const active = pending.find(item => sync.active === item.key);
  if (active) {
    const preferences = new LocalPluginPreferences(path.join(appDir, "plugins"));
    await preferences.load();
    await preferences.initialize({ [active.pluginId]: true });
  }
  const oldStatuses: string[] = [];
  for (const item of pending) {
    const { key, pluginId, pathKey, defaultPath, statusPrefix } = item;
    const legacy = sync[key];
    delete rest[key];
    const hadPluginConfig = Object.hasOwn(configurations, pluginId);
    if (!hadPluginConfig) {
      const credentials = setting.integration?.[key];
      const config = { ...credentials, ...legacy };
      if (key === "webdav") {
        for (const field of ["url", "username", "password"] as const)
          config[field] =
            typeof credentials?.[field] === "string" ? credentials[field] : (legacy?.[field] ?? "");
        config.pathPrefix = legacy?.pathPrefix || "";
      }
      if (key === "aliOSS") {
        config.accessKeyId =
          (typeof credentials?.accessKeyId === "string" && credentials.accessKeyId) ||
          legacy?.accessKeyId ||
          "";
        config.accessKeySecret =
          (typeof credentials?.accessKeySecret === "string" && credentials.accessKeySecret) ||
          legacy?.accessKeySecret ||
          "";
      }
      configurations[pluginId] =
        key === "webdav"
          ? {
              url: config.url,
              username: config.username,
              password: config.password,
              pathPrefix: config.pathPrefix,
            }
          : key === "github"
            ? {
                token: typeof credentials?.token === "string" ? credentials.token : "",
                owner:
                  credentials?.user &&
                  typeof credentials.user === "object" &&
                  "name" in credentials.user &&
                  typeof credentials.user.name === "string"
                    ? credentials.user.name
                    : "",
                repo: legacy?.repo ?? "",
                branch: legacy?.branch ?? "",
                pathPrefix: legacy?.pathPrefix ?? "",
              }
            : config;
    }
    if (!legacy || hadPluginConfig) continue;
    let identity = legacy.bucket;
    if (key === "github") identity = legacy.repo;
    if (key === "webdav") {
      const url = setting.integration?.webdav?.url;
      if (typeof url !== "string") continue;
      let host = url;
      try {
        host = new URL(url).host;
      } catch {
        /* 旧账本对无效URL使用完整地址。 */
      }
      identity = createHash("md5").update(host).digest("hex").slice(0, 8);
    }
    if (!identity) continue;
    const prefixHash = createHash("md5")
      .update(legacy[pathKey] || defaultPath)
      .digest("hex")
      .slice(0, 8);
    const source = path.join(
      appDir,
      "sync-status",
      key === "github"
        ? `github-${legacy.repo}-${legacy.branch}.json`
        : `${statusPrefix}-${identity}-${prefixHash}.json`
    );
    const target = path.join(
      appDir,
      "sync-status",
      pluginSyncStatusFile(pluginId, configurations[pluginId])
    );
    const sourceData = await readFile(source, "utf8").catch(error => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (sourceData) {
      const status = JSON.parse(sourceData);
      const temporary = target + "." + randomUUID() + ".tmp";
      try {
        await writeFile(
          temporary,
          JSON.stringify({ ...status, provider: "plugin", config: { pluginId } }),
          { flag: "wx" }
        );
        await rename(temporary, target);
        oldStatuses.push(source);
      } finally {
        await rm(temporary, { force: true });
      }
    }
  }
  const next = {
    ...setting,
    sync: {
      ...rest,
      active: active ? "plugin" : sync.active,
      plugin: { ...sync.plugin, id: active?.pluginId ?? sync.plugin?.id ?? "", configurations },
    },
  };
  await save(next);
  for (const oldStatus of oldStatuses) await rm(oldStatus, { force: true });
  return next;
}
