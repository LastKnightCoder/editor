import type { JsonValue } from "@tau/plugins";
import type { PluginTtsMutation, SettingCompat, TTSModelSetting, TTSUsageConfig } from "../types";
import { enqueueProviderConfigWrite } from "./provider-config";
import { mutatePluginTts } from "./tauri";

export function mutateTtsSettings(
  database: string,
  mutation: PluginTtsMutation
): Promise<SettingCompat> {
  return enqueueProviderConfigWrite(() => mutatePluginTts(database, mutation));
}

export function createTtsAccount(database: string, pluginId: string, name: string) {
  return mutateTtsSettings(database, { type: "create", pluginId, name });
}

export function saveTtsConfig(
  database: string,
  instanceId: string,
  pluginId: string,
  config: JsonValue,
  models: TTSModelSetting[]
) {
  return mutateTtsSettings(database, {
    type: "saveConfig",
    instanceId,
    pluginId,
    config,
    models,
  });
}

export function renameTtsAccount(database: string, instanceId: string, name: string) {
  return mutateTtsSettings(database, { type: "rename", instanceId, name });
}

export function deleteTtsAccount(database: string, instanceId: string) {
  return mutateTtsSettings(database, { type: "deleteAccount", instanceId });
}

export function addTtsModel(database: string, instanceId: string, model: TTSModelSetting) {
  return mutateTtsSettings(database, { type: "addModel", instanceId, model });
}

export function deleteTtsModel(database: string, instanceId: string, modelId: string) {
  return mutateTtsSettings(database, { type: "deleteModel", instanceId, modelId });
}

export function selectTtsUsage(database: string, selection: TTSUsageConfig | null) {
  return mutateTtsSettings(database, { type: "select", selection });
}
