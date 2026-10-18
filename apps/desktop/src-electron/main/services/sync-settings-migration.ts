import { LocalPluginPreferences } from "@tau/plugins/local-state";
import path from "node:path";
import { readFile, writeFile, rename, rm } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { pluginSyncStatusFile } from "./plugin-sync-status";

const pluginId = "tau.sync-s3";
interface MigrationSettings {
  sync?: {
    active?: string;
    s3?: { bucket?: string; region?: string; pathPrefix?: string };
    plugin?: { id?: string; configurations?: Record<string, unknown> };
    [key: string]: unknown;
  };
  integration?: { s3?: Record<string, unknown> };
  [key: string]: unknown;
}

/** 仅升级旧配置；共享账号凭据仍由发布与资源上传消费。 */
export async function migrateS3SyncSettings(
  setting: MigrationSettings,
  appDir: string,
  save: (setting: MigrationSettings) => Promise<void>
): Promise<MigrationSettings> {
  const sync = setting.sync;
  if (!sync || (!Object.hasOwn(sync, "s3") && sync.active !== "s3")) return setting;
  const { s3, ...rest } = sync;
  const configurations = { ...sync.plugin?.configurations };
  const hadPluginConfig = Object.hasOwn(configurations, pluginId);
  if (!Object.hasOwn(configurations, pluginId) && (s3 || sync.active === "s3")) {
    configurations[pluginId] = { ...setting.integration?.s3, ...s3 };
  }
  const next = {
    ...setting,
    sync: {
      ...rest,
      active: sync.active === "s3" ? "plugin" : sync.active,
      plugin: {
        ...sync.plugin,
        id: sync.active === "s3" ? pluginId : (sync.plugin?.id ?? ""),
        configurations,
      },
    },
  };
  if (sync.active === "s3") {
    const preferences = new LocalPluginPreferences(path.join(appDir, "plugins"));
    await preferences.load();
    await preferences.initialize({ [pluginId]: true });
  }
  let oldStatus: string | undefined;
  if (s3?.bucket && !hadPluginConfig) {
    const prefixHash = createHash("md5")
      .update(s3.pathPrefix || "")
      .digest("hex")
      .slice(0, 8);
    const source = path.join(appDir, "sync-status", `s3-${s3.bucket}-${prefixHash}.json`);
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
        oldStatus = source;
      } finally {
        await rm(temporary, { force: true });
      }
    }
  }
  await save(next);
  if (oldStatus) await rm(oldStatus, { force: true });
  return next;
}
