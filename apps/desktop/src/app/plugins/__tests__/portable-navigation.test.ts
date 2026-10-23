import { describe, expect, it, vi } from "vitest";
import { definePlugin, type PluginContext, type PluginPageHandle } from "@tau/plugins";
import { createMemoryStorage } from "@tau/plugins/host";
import { createPluginEnvironmentStore } from "@tau/plugins/environment-host";
import { DesktopPluginRuntime } from "../runtime";

describe("真实桌面语义入口", () => {
  it("页面不自动进侧栏；入口复用真实导航、环境更新和资源回收", async () => {
    const push = vi.fn();
    const environment = createPluginEnvironmentStore({
      platform: "desktop",
      input: { coarsePointer: false, finePointer: true },
    });
    let context!: PluginContext;
    let page!: PluginPageHandle;
    const runtime = new DesktopPluginRuntime({
      workspaceId: "test",
      storage: createMemoryStorage(),
      navigator: { push },
      plugins: [],
      environmentSource: environment,
    });
    try {
      runtime.host.registerTrusted(
        definePlugin({
          id: "test.portable",
          name: "测试",
          version: "1",
          create: () => ({
            activate(ctx) {
              context = ctx;
              page = ctx.pages.register({ id: "counter", title: "计数", component: () => null });
            },
          }),
        })
      );
      await runtime.host.enable("test.portable");
      expect(runtime.listSidebar().items).toHaveLength(0);
      context.navigation.registerEntry({
        id: "counter",
        title: "计数",
        page,
        params: { count: 1 },
      });
      expect(runtime.host.listContributions("test.portable").navigation).toBe(1);
      context.sidebar.registerItem({ id: "navigation.counter", title: "桌面专属入口", page });
      expect(new Set(runtime.listSidebar().items.map(item => item.id)).size).toBe(2);
      await runtime.listSidebar().items[0].open();
      expect(push).toHaveBeenCalledWith("plugin-page", {
        pluginId: "test.portable",
        pageId: "counter",
        instanceId: "single",
        params: '{"count":1}',
      });
      environment.update({ input: { coarsePointer: true, finePointer: true } });
      expect(context.environment.input.coarsePointer).toBe(true);
      await page.dispose();
      expect(runtime.listSidebar().items).toHaveLength(0);
      expect(runtime.host.listContributions("test.portable").navigation).toBeUndefined();
    } finally {
      await runtime.dispose();
    }
  });
});
