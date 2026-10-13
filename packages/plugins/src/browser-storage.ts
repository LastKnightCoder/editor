import type { StorageAdapter, StorageScope } from "./storage";
import { assertStorageActive } from "./storage";
import { assertLocalId, copyJson } from "./values";

/** 宿主显式注入存储，不在模块加载时访问 window。 */
export function createBrowserStorage(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">
): StorageAdapter {
  const keyFor = (scope: StorageScope, key: string) => {
    assertStorageActive(scope);
    assertLocalId(key);
    return `tau-plugin-prefs:${JSON.stringify([scope.workspaceId, scope.pluginId, key])}`;
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
