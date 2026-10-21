import { copyJson, type StorageAdapter, type StorageScope } from "@tau/plugins/host";
import { deletePluginKv, getPluginKv, importPluginKv, setPluginKv } from "@/commands/plugin-kv";
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

/** 旧版私有存储在 localStorage 的键：前缀 + [工作区, 插件, 键] */
const LEGACY_PREFIX = "tau-plugin-prefs:";

/**
 * 把以库名（含 .db 别名）为工作区的旧键改挂到稳定工作区 UUID；目标已有值时保留目标。
 * 先复制全部再删旧键，写入失败抛错且旧键保留，下次启动重试。
 */
export function migratePluginPreferences(storage: Storage, name: string, workspaceId: string) {
  const aliases = new Set([name, name.endsWith(".db") ? name.slice(0, -3) : name + ".db"]);
  const oldKeys: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(LEGACY_PREFIX)) continue;
    const scope = JSON.parse(key.slice(LEGACY_PREFIX.length)) as string[];
    if (!Array.isArray(scope) || scope.length !== 3 || !aliases.has(scope[0])) continue;
    const target = `${LEGACY_PREFIX}${JSON.stringify([workspaceId, scope[1], scope[2]])}`;
    const value = storage.getItem(key);
    if (value !== null && storage.getItem(target) === null) storage.setItem(target, value);
    oldKeys.push(key);
  }
  for (const key of oldKeys) storage.removeItem(key);
}

/**
 * 一次性把本机 localStorage 里属于该工作区的插件私有存储迁入当前库，成功后删除旧键。
 * 库里已有的键保留库里的值（可能来自其他设备的同步）。失败时抛错、旧键原样保留，下次启动重试。
 */
export async function migrateLegacyPluginStorage(
  storage: Pick<Storage, "key" | "length" | "getItem" | "removeItem">,
  workspaceId: string,
  databaseName: string
): Promise<number> {
  const keys: string[] = [];
  const entries: Array<{ pluginId: string; key: string; value: string }> = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(LEGACY_PREFIX)) continue;
    let scope: unknown;
    try {
      scope = JSON.parse(key.slice(LEGACY_PREFIX.length));
    } catch {
      continue;
    }
    if (!Array.isArray(scope) || scope.length !== 3 || scope[0] !== workspaceId) continue;
    const [, pluginId, name] = scope as [string, unknown, unknown];
    const value = storage.getItem(key);
    if (typeof pluginId !== "string" || typeof name !== "string" || value === null) continue;
    keys.push(key);
    entries.push({ pluginId, key: name, value });
  }
  if (!entries.length) return 0;
  await bindDatabaseCommands({ importPluginKv }, { databaseName }).importPluginKv(
    databaseName,
    entries
  );
  for (const key of keys) storage.removeItem(key);
  return entries.length;
}
