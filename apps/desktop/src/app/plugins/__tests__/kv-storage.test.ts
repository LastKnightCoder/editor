import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StorageScope } from "@tau/plugins/host";

const mocks = vi.hoisted(() => ({
  values: new Map<string, string>(),
}));
vi.mock("@/commands/plugin-kv", () => ({
  getPluginKv: async (_db: string, pluginId: string, key: string) =>
    mocks.values.get(`${pluginId}/${key}`) ?? null,
  setPluginKv: async (_db: string, pluginId: string, key: string, value: string) =>
    void mocks.values.set(`${pluginId}/${key}`, value),
  deletePluginKv: async (_db: string, pluginId: string, key: string) =>
    void mocks.values.delete(`${pluginId}/${key}`),
}));

import { createDatabaseStorage } from "../kv-storage";

beforeEach(() => {
  mocks.values.clear();
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
});
