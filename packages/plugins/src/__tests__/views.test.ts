import { describe, expect, it, vi } from "vitest";
import { definePlugin, type PluginContext } from "../index";
import { PluginHost, createMemoryStorage } from "../host";

describe("详情区块", () => {
  it("校验定义、类型去重，停用时清理并计入贡献", async () => {
    const dispose = vi.fn();
    const registerEntityPanel = vi.fn(() => ({ dispose }));
    const host = new PluginHost({
      workspaceId: "A",
      storage: createMemoryStorage(),
      views: { registerEntityPanel },
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
    const base = { id: "related", kinds: ["card"] as const, component };
    expect(() => context.views.registerEntityPanel({ ...base, id: "a b" })).toThrow("插件标识");
    expect(() => context.views.registerEntityPanel({ ...base, kinds: [] })).toThrow("至少");
    expect(() => context.views.registerEntityPanel({ ...base, kinds: ["diary" as never] })).toThrow(
      "不支持"
    );
    expect(() => context.views.registerEntityPanel({ ...base, component: "div" as never })).toThrow(
      "组件"
    );
    context.views.registerEntityPanel({ ...base, kinds: ["card", "document", "card"] });
    expect(registerEntityPanel).toHaveBeenCalledWith(context, {
      id: "related",
      kinds: ["card", "document"],
      component,
    });
    expect(host.listContributions("sample")).toMatchObject({ "entity-panel": 1 });
    await host.disable("sample");
    expect(dispose).toHaveBeenCalledTimes(1);
    await host.dispose();
  });
});
