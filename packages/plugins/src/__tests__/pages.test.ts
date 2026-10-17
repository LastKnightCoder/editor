import { describe, expect, it, vi } from "vitest";
import { definePlugin, type PluginContext, type PluginPageHandle } from "../index";
import {
  PluginHost,
  createBrowserStorage,
  createMemoryStorage,
  normalizePageParams,
} from "../host";

describe("页面 API 和界面订阅", () => {
  it("激活失败回收页面，停用后旧句柄不能再打开", async () => {
    const open = vi.fn(async () => undefined);
    const dispose = vi.fn();
    let page!: PluginPageHandle;
    let fail = true;
    const host = new PluginHost({
      workspaceId: "A",
      storage: createMemoryStorage(),
      pages: {
        register: () => ({ id: "sample:page", open, dispose }),
      },
    });
    host.registerTrusted(
      definePlugin({
        id: "sample",
        name: "示例",
        version: "1",
        create: () => ({
          activate(ctx) {
            page = ctx.pages.register({ id: "page", title: "页面", component: () => null });
            if (fail) throw new Error("失败");
          },
        }),
      })
    );
    await expect(host.enable("sample")).rejects.toThrow("失败");
    expect(dispose).toHaveBeenCalledTimes(1);
    fail = false;
    await host.enable("sample");
    await page.open({ value: 1 });
    expect(open).toHaveBeenCalledWith({ value: 1 });
    await page.dispose();
    await expect(page.open()).rejects.toThrow("已注销");
    await host.disable("sample");
    expect(dispose).toHaveBeenCalledTimes(2);
    await expect(page.open()).rejects.toThrow();
    await host.dispose();
  });

  it("无界面宿主明确拒绝页面注册，状态订阅可注销", async () => {
    const host = new PluginHost({ workspaceId: "A", storage: createMemoryStorage() });
    let context!: PluginContext;
    host.registerTrusted(
      definePlugin({
        id: "sample",
        name: "示例",
        version: "1",
        create: () => ({
          activate(ctx) {
            context = ctx;
          },
        }),
      })
    );
    const listener = vi.fn();
    const off = host.subscribe(listener);
    await host.enable("sample");
    expect(host.listPlugins()[0].state).toBe("active");
    expect(listener).toHaveBeenCalled();
    expect(() =>
      context.pages.register({ id: "page", title: "页面", component: () => null })
    ).toThrow("不支持页面");
    off();
    listener.mockClear();
    await host.disable("sample");
    expect(listener).not.toHaveBeenCalled();
    await host.dispose();
  });

  it("有限标量参数归一化，拒绝数组、嵌套值和无穷数", () => {
    expect(normalizePageParams({ z: true, a: "值", n: 1 })).toEqual({ a: "值", n: 1, z: true });
    for (const value of [null, [], { nested: {} }, { n: Infinity }])
      expect(() => normalizePageParams(value)).toThrow();
  });

  it("浏览器存储按插件与工作区分域，读取异常不静默清空", async () => {
    const values = new Map<string, string>();
    const storage = createBrowserStorage({
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: key => {
        values.delete(key);
      },
    });
    const controller = new AbortController();
    const scope = { pluginId: "sample", workspaceId: "A", signal: controller.signal };
    await storage.set(scope, "value", { enabled: true });
    expect(await storage.get({ ...scope, workspaceId: "B" }, "value")).toBeUndefined();
    expect(await storage.get({ ...scope, pluginId: "other" }, "value")).toBeUndefined();
    const key = [...values.keys()][0];
    values.set(key, "损坏 JSON");
    await expect(storage.get(scope, "value")).rejects.toThrow();
    expect(values.get(key)).toBe("损坏 JSON");
    await storage.delete(scope, "value");
    controller.abort();
    await expect(storage.set(scope, "value", 2)).rejects.toThrow("已停用");
  });
});
