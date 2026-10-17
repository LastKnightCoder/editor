import { describe, expect, it, vi } from "vitest";
import { definePlugin, type PluginContext, type PluginSettingsHandle } from "../index";
import { createMemoryStorage, PluginHost } from "../host";

const section = { id: "reading", title: "阅读设置", component: () => null };

describe("自定义设置 API", () => {
  it("激活失败回收分区，注销与停用使旧句柄失效，重新启用生成新实例", async () => {
    const dispose = vi.fn();
    const open = vi.fn(async () => undefined);
    const host = new PluginHost({
      workspaceId: "A",
      storage: createMemoryStorage(),
      settings: { register: () => ({ id: "plugin:example:reading", open, dispose }) },
    });
    let context!: PluginContext;
    let handle!: PluginSettingsHandle;
    let fail = true;
    host.registerTrusted(
      definePlugin({
        id: "example",
        name: "示例",
        version: "1",
        create: () => ({
          activate(ctx) {
            context = ctx;
            handle = ctx.settings.register(section);
            if (fail) throw new Error("激活失败");
          },
        }),
      })
    );
    await expect(host.enable("example")).rejects.toThrow("激活失败");
    expect(dispose).toHaveBeenCalledTimes(1);
    fail = false;
    await host.enable("example");
    await handle.open();
    expect(open).toHaveBeenCalledTimes(1);
    const oldContext = context;
    await handle.dispose();
    await expect(handle.open()).rejects.toThrow("已注销");
    await host.disable("example");
    expect(dispose).toHaveBeenCalledTimes(2);
    await host.enable("example");
    expect(() => oldContext.settings.register(section)).toThrow();
    await host.unregister("example");
    await expect(handle.open()).rejects.toThrow();
    expect(dispose).toHaveBeenCalledTimes(3);
    await host.dispose();
  });

  it("无界面宿主拒绝分区，不允许空标题或非法局部 ID", async () => {
    expect(typeof document).toBe("undefined");
    const host = new PluginHost({ workspaceId: "A", storage: createMemoryStorage() });
    let context!: PluginContext;
    host.registerTrusted(
      definePlugin({
        id: "example",
        name: "示例",
        version: "1",
        create: () => ({
          activate(ctx) {
            context = ctx;
          },
        }),
      })
    );
    await host.enable("example");
    expect(() => context.settings.register(section)).toThrow("不支持设置");
    expect(() => context.settings.register({ ...section, title: " " })).toThrow("标题");
    expect(() => context.settings.register({ ...section, id: "../bad" })).toThrow();
    await host.dispose();
  });
});
