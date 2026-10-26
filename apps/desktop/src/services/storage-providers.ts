/** 同步与资源存储提供方的配置保存、选用与连接探测；配置与选用相互独立。 */

import { produce } from "immer";
import type { JsonValue } from "@tau/plugins";
import { copyJson } from "@tau/plugins/host";
import { databaseSyncObjects, readDatabaseSyncVersion } from "@tau/db-schema/sync-protocol";
import useSettingStore, { EImageBed, ESync } from "@/stores/useSettingStore";
import { savePluginSyncConfig, savePluginUploadConfig } from "@/commands/plugin-local";
import { chunkDigest } from "@/services/chunkedSync";
import { PluginSyncProvider } from "@/utils/sync/PluginSyncProvider";

export type StorageTarget = "sync" | "upload";
export const LOCAL_UPLOAD_TARGET = "local";

const group = (target: StorageTarget) => (target === "sync" ? "sync" : "imageBed");

export function readStoredProviderConfig(target: StorageTarget, pluginId: string) {
  const plugin = useSettingStore.getState().setting[group(target)].plugin;
  return plugin && Object.hasOwn(plugin.configurations, pluginId)
    ? (copyJson(plugin.configurations[pluginId] as JsonValue) as JsonValue)
    : undefined;
}

export async function saveProviderConfig(
  target: StorageTarget,
  pluginId: string,
  config: JsonValue
) {
  const snapshot = copyJson(config);
  await (target === "sync" ? savePluginSyncConfig : savePluginUploadConfig)(pluginId, snapshot);
  useSettingStore.setState(state => ({
    setting: produce(state.setting, draft => {
      const current = draft[group(target)];
      current.plugin = {
        id: current.plugin?.id ?? "",
        configurations: { ...current.plugin?.configurations, [pluginId]: snapshot },
      };
    }),
  }));
}

export function selectSyncProvider(pluginId: string) {
  useSettingStore.setState(state => ({
    setting: produce(state.setting, draft => {
      draft.sync.active = ESync.Plugin;
      draft.sync.plugin = { id: pluginId, configurations: draft.sync.plugin?.configurations ?? {} };
    }),
  }));
}

/** pluginId 为 LOCAL_UPLOAD_TARGET 时改回本地保存，保留各插件已存配置。 */
export function selectUploadTarget(pluginId: string) {
  useSettingStore.setState(state => ({
    setting: produce(state.setting, draft => {
      const configurations = draft.imageBed.plugin?.configurations ?? {};
      if (pluginId === LOCAL_UPLOAD_TARGET) {
        draft.imageBed.active = EImageBed.Local;
        draft.imageBed.plugin = { id: draft.imageBed.plugin?.id ?? "", configurations };
      } else {
        draft.imageBed.active = EImageBed.Plugin;
        draft.imageBed.plugin = { id: pluginId, configurations };
      }
    }),
  }));
}

export function currentProviderId(target: StorageTarget): string {
  const { sync, imageBed } = useSettingStore.getState().setting;
  if (target === "sync") return sync.active === ESync.Plugin ? (sync.plugin?.id ?? "") : "";
  return imageBed.active === EImageBed.Plugin ? (imageBed.plugin?.id ?? "") : LOCAL_UPLOAD_TARGET;
}

/** 用给定插件与配置读取当前数据库的云端版本，不改变选用。 */
export async function probeRemoteDatabaseVersion(pluginId: string, config: JsonValue) {
  const provider = new PluginSyncProvider(pluginId, copyJson(config));
  const { active: databaseName } = useSettingStore.getState().setting.database;
  try {
    const objects = await databaseSyncObjects(databaseName, chunkDigest);
    return await readDatabaseSyncVersion(provider, objects.version);
  } finally {
    await provider.dispose?.();
  }
}
