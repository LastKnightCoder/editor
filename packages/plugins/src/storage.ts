import type { JsonValue } from "./index";
import { copyJson } from "./values";

export interface StorageScope {
  readonly pluginId: string;
  readonly workspaceId: string;
  readonly signal: AbortSignal;
}

/** 适配器写入必须在真正提交前调用 assertStorageActive。 */
export interface StorageAdapter {
  get(scope: StorageScope, key: string): Promise<JsonValue | undefined>;
  set(scope: StorageScope, key: string, value: JsonValue): Promise<void>;
  delete(scope: StorageScope, key: string): Promise<void>;
}

export function assertStorageActive(scope: StorageScope): void {
  if (scope.signal.aborted) throw new Error("插件实例已停用");
}

export function storageNamespace(scope: Pick<StorageScope, "pluginId" | "workspaceId">): string {
  return JSON.stringify([scope.workspaceId, scope.pluginId]);
}

export function createMemoryStorage(): StorageAdapter {
  const namespaces = new Map<string, Map<string, JsonValue>>();
  const valuesFor = (scope: StorageScope) => {
    assertStorageActive(scope);
    const key = storageNamespace(scope);
    let values = namespaces.get(key);
    if (!values) namespaces.set(key, (values = new Map()));
    return values;
  };
  return {
    async get(scope, key) {
      const value = valuesFor(scope).get(key);
      return value === undefined ? undefined : copyJson(value);
    },
    async set(scope, key, value) {
      valuesFor(scope).set(key, copyJson(value));
    },
    async delete(scope, key) {
      valuesFor(scope).delete(key);
    },
  };
}
