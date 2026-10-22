import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StorageScope } from "@tau/plugins/host";

const mocks = vi.hoisted(() => ({
  values: new Map<string, string>(),
  imported: [] as unknown[],
  failImport: false,
}));
vi.mock("@/commands/plugin-kv", () => ({
  getPluginKv: async (_db: string, pluginId: string, key: string) =>
    mocks.values.get(`${pluginId}/${key}`) ?? null,
  setPluginKv: async (_db: string, pluginId: string, key: string, value: string) =>
    void mocks.values.set(`${pluginId}/${key}`, value),
  deletePluginKv: async (_db: string, pluginId: string, key: string) =>
    void mocks.values.delete(`${pluginId}/${key}`),
  importPluginKv: async (_db: string, entries: unknown[]) => {
    if (mocks.failImport) throw new Error("写入失败");
    mocks.imported.push(...entries);
    return entries.length;
  },
}));

import {
  createDatabaseStorage,
  migrateLegacyPluginStorage,
  migratePluginPreferences,
} from "../kv-storage";

const legacyKey = (workspace: string, plugin: string, key: string) =>
  `tau-plugin-prefs:${JSON.stringify([workspace, plugin, key])}`;

function memoryStorage(initial: Record<string, string>) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    get length() {
      return map.size;
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    removeItem: (key: string) => void map.delete(key),
  };
}

beforeEach(() => {
  mocks.values.clear();
  mocks.imported = [];
  mocks.failImport = false;
});

describe("插件私有存储入主库", () => {
  it("读写复制 JSON，停用后拒绝，键名受限", async () => {
    const storage = createDatabaseStorage("data.db");
    const controller = new AbortController();
    const scope: StorageScope = { pluginId: "p", workspaceId: "w", signal: controller.signal };
    await storage.set(scope, "prefs", { size: 2 });
    expect(mocks.values.get("p/prefs")).toBe('{"size":2}');
    expect(await storage.get(scope, "prefs")).toEqual({ size: 2 });
    expect(await storage.get(scope, "missing")).toBeUndefined();
    await expect(storage.set(scope, "bad key", 1)).rejects.toThrow("插件标识");
    controller.abort();
    await expect(storage.get(scope, "prefs")).rejects.toThrow("已停用");
  });

  it("只迁移当前工作区的旧键，成功后删除；失败保留旧键", async () => {
    const local = memoryStorage({
      [legacyKey("w1", "p", "a")]: '"x"',
      [legacyKey("w2", "p", "a")]: '"other"',
      "tau-local-plugin-enabled:v1:p": "true",
    });
    mocks.failImport = true;
    await expect(migrateLegacyPluginStorage(local, "w1", "data.db")).rejects.toThrow("写入失败");
    expect(local.map.has(legacyKey("w1", "p", "a"))).toBe(true);

    mocks.failImport = false;
    expect(await migrateLegacyPluginStorage(local, "w1", "data.db")).toBe(1);
    expect(mocks.imported).toEqual([{ pluginId: "p", key: "a", value: '"x"' }]);
    expect([...local.map.keys()]).toEqual([
      legacyKey("w2", "p", "a"),
      "tau-local-plugin-enabled:v1:p",
    ]);
    expect(await migrateLegacyPluginStorage(local, "w1", "data.db")).toBe(0);
  });
});

describe("偏好从库名迁到稳定工作区身份", () => {
  beforeEach(() => localStorage.clear());

  it("旧偏好迁到稳定身份，已有目标值优先，其他库保持原样", () => {
    localStorage.setItem(legacyKey("A.db", "p", "count"), "1");
    localStorage.setItem(legacyKey("B.db", "p", "count"), "2");
    localStorage.setItem(legacyKey("identity", "p", "count"), "3");
    migratePluginPreferences(localStorage, "A.db", "identity");
    expect(localStorage.getItem(legacyKey("identity", "p", "count"))).toBe("3");
    expect(localStorage.getItem(legacyKey("A.db", "p", "count"))).toBeNull();
    expect(localStorage.getItem(legacyKey("B.db", "p", "count"))).toBe("2");
  });

  it("写入失败保留旧值，重试可完成", () => {
    localStorage.setItem(legacyKey("A.db", "p", "count"), "5");
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("存储已满");
    });
    try {
      expect(() => migratePluginPreferences(localStorage, "A.db", "stable")).toThrow("存储已满");
      expect(localStorage.getItem(legacyKey("A.db", "p", "count"))).toBe("5");
    } finally {
      write.mockRestore();
    }
    migratePluginPreferences(localStorage, "A.db", "stable");
    expect(localStorage.getItem(legacyKey("stable", "p", "count"))).toBe("5");
    expect(localStorage.getItem(legacyKey("A.db", "p", "count"))).toBeNull();
  });
});
