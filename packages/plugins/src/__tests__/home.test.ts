import { describe, expect, it, vi } from "vitest";
import { definePlugin, type PluginContext } from "../index";
import { PluginHost, createMemoryStorage } from "../host";

describe("首页面板", () => {
  it("校验定义、补齐宽度，停用时清理并计入贡献", async () => {
    const dispose = vi.fn();
    const registerPanel = vi.fn(() => ({ dispose }));
    const host = new PluginHost({
      workspaceId: "A",
      storage: createMemoryStorage(),
      home: { registerPanel },
    });
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
    await host.enable("sample");
    const component = () => null;
    expect(() => context.home.registerPanel({ id: "a b", title: "x", component })).toThrow(
      "插件标识"
    );
    expect(() => context.home.registerPanel({ id: "p", title: " ", component })).toThrow("标题");
    expect(() =>
      context.home.registerPanel({ id: "p", title: "x", component: "div" as never })
    ).toThrow("组件");
    expect(() =>
      context.home.registerPanel({ id: "p", title: "x", component, size: "half" as never })
    ).toThrow("宽度");
    context.home.registerPanel({ id: "p", title: "阅读", component });
    expect(registerPanel).toHaveBeenCalledWith(context, {
      id: "p",
      title: "阅读",
      component,
      size: "wide",
    });
    expect(host.listContributions("sample")).toMatchObject({ home: 1 });
    await host.disable("sample");
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(() => context.home.registerPanel({ id: "q", title: "x", component })).toThrow();
    await host.dispose();
  });

  it("宿主不支持时明确拒绝", async () => {
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
    await host.enable("sample");
    expect(() =>
      context.home.registerPanel({ id: "p", title: "x", component: () => null })
    ).toThrow("不支持首页面板");
    await host.dispose();
  });
});
