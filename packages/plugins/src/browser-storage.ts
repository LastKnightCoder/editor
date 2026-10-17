import type { StorageAdapter, StorageScope } from "./storage";
import { assertStorageActive } from "./storage";
import { assertLocalId, copyJson } from "./values";

const PREFIX = "tau-plugin-prefs:";

/** 宿主显式注入存储，不在模块加载时访问 window。 */
export function createBrowserStorage(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">
): StorageAdapter {
  const keyFor = (scope: StorageScope, key: string) => {
    assertStorageActive(scope);
    assertLocalId(key);
    return `${PREFIX}${JSON.stringify([scope.workspaceId, scope.pluginId, key])}`;
  };
  return {
    async get(scope, key) {
      const value = storage.getItem(keyFor(scope, key));
      return value === null ? undefined : copyJson(JSON.parse(value));
    },
    async set(scope, key, value) {
      const snapshot = JSON.stringify(copyJson(value));
      storage.setItem(keyFor(scope, key), snapshot);
    },
    async delete(scope, key) {
      storage.removeItem(keyFor(scope, key));
    },
  };
}

/** 删除某插件在所有工作区的私有存储，用于卸载时用户明确选择清除数据。 */
export function clearBrowserPluginStorage(
  storage: Pick<Storage, "key" | "length" | "removeItem">,
  pluginId: string
) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(PREFIX)) continue;
    try {
      if ((JSON.parse(key.slice(PREFIX.length)) as unknown[])[1] === pluginId) keys.push(key);
    } catch {
      // 非本协议写入的同前缀键不属于任何插件。
    }
  }
  for (const key of keys) storage.removeItem(key);
}
