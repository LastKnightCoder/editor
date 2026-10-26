import { copyJson, type StorageAdapter, type StorageScope } from "@tau/plugins/host";
import { deletePluginKv, getPluginKv, setPluginKv } from "@/commands/plugin-kv";
import { bindDatabaseCommands } from "@/services/command-context";

const KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

function assertStorageActive(scope: StorageScope) {
  if (scope.signal.aborted) throw new Error("插件实例已停用");
}

function assertKey(key: string) {
  if (typeof key !== "string" || !KEY_PATTERN.test(key))
    throw new Error("插件标识必须为 1 至 128 位字母、数字、点、横线或下划线");
}

/**
 * 插件私有存储（context.storage）存于当前库的 plugin_kv，随云同步。命令固定到 Provider
 * 创建宿主时的库，并带插件实例的 signal：停用后的迟到读写被拒绝。
 */
export function createDatabaseStorage(databaseName: string): StorageAdapter {
  const bound = (signal: AbortSignal) =>
    bindDatabaseCommands({ getPluginKv, setPluginKv, deletePluginKv }, { databaseName, signal });
  return {
    async get(scope, key) {
      assertStorageActive(scope);
      assertKey(key);
      const value = await bound(scope.signal).getPluginKv(databaseName, scope.pluginId, key);
      return value === null ? undefined : copyJson(JSON.parse(value));
    },
    async set(scope, key, value) {
      assertStorageActive(scope);
      assertKey(key);
      const snapshot = JSON.stringify(copyJson(value));
      await bound(scope.signal).setPluginKv(databaseName, scope.pluginId, key, snapshot);
    },
    async delete(scope, key) {
      assertStorageActive(scope);
      assertKey(key);
      await bound(scope.signal).deletePluginKv(databaseName, scope.pluginId, key);
    },
  };
}
