import { describe, expect, it, vi } from "vitest";
import { definePlugin, type PluginContext } from "../index";
import { PluginHost, createMemoryStorage } from "../host";

describe("首页面板", () => {
  it("校验定义、补齐宽度，停用时清理并计入贡献", async () => {
    const dispose = vi.fn();
    const registerPanel = vi.fn(() => ({ dispose }));
    const host = new PluginHost({
      environment: { platform: "desktop", input: { coarsePointer: false, finePointer: true } },
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
    expect(() =>
      context.home.registerPanel({
        id: "p",
        title: "x",
        component,
        action: { title: " ", run: () => {} },
      })
    ).toThrow("入口");
    expect(() =>
      context.home.registerPanel({
        id: "p",
        title: "x",
        component,
        action: { title: "看", run: 1 as never },
      })
    ).toThrow("入口");
    context.home.registerPanel({ id: "p", title: "阅读", component });
    expect(registerPanel).toHaveBeenCalledWith(context, {
      id: "p",
      title: "阅读",
      component,
      size: "wide",
      action: null,
    });
    const run = vi.fn();
    context.home.registerPanel({
      id: "q",
      title: "书架",
      component,
      action: { title: "查看书架", run },
    });
    expect(registerPanel).toHaveBeenLastCalledWith(context, {
      id: "q",
      title: "书架",
      component,
      size: "wide",
      action: { title: "查看书架", run },
    });
    expect(host.listContributions("sample")).toMatchObject({ home: 2 });
    await host.disable("sample");
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(() => context.home.registerPanel({ id: "r", title: "x", component })).toThrow();
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
