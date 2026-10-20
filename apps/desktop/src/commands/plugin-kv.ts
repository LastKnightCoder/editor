import { invoke } from "@/electron";

/** 插件私有存储命令；调用方经 bindDatabaseCommands 固定到插件宿主的数据库 */
export const getPluginKv = (
  databaseName: string,
  pluginId: string,
  key: string
): Promise<string | null> => invoke("plugin-kv:get", { databaseName, pluginId, key });

export const setPluginKv = (
  databaseName: string,
  pluginId: string,
  key: string,
  value: string
): Promise<void> => invoke("plugin-kv:set", { databaseName, pluginId, key, value });

export const deletePluginKv = (
  databaseName: string,
  pluginId: string,
  key: string
): Promise<void> => invoke("plugin-kv:delete", { databaseName, pluginId, key });

export const importPluginKv = (
  databaseName: string,
  entries: Array<{ pluginId: string; key: string; value: string }>
): Promise<number> => invoke("plugin-kv:import", { databaseName, entries });

export const clearPluginKv = (databaseName: string, pluginId: string): Promise<number> =>
  invoke("plugin-kv:clear", { databaseName, pluginId });
