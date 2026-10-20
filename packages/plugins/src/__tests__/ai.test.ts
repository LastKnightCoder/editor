import { expect, it, vi } from "vitest";
import { definePlugin } from "../index";
import { PluginHost, createMemoryStorage } from "../host";
import { unavailableAI } from "../ai";

it("延迟加载插件的 AI 声明绑定真实身份，并在停用时取消生命周期", async () => {
  let lifetime: AbortSignal | undefined;
  const bind = vi.fn(async (plugin, features, signal: AbortSignal) => {
    expect(plugin).toEqual({ id: "test.ai", name: "AI 测试" });
    expect(features).toEqual([{ id: "summary", name: "摘要" }]);
    lifetime = signal;
    return unavailableAI;
  });
  const host = new PluginHost({
    workspaceId: "test",
    storage: createMemoryStorage(),
    ai: { bind },
  });
  const plugin = definePlugin({
    id: "test.ai",
    name: "AI 测试",
    version: "1.0.0",
    ai: { features: [{ id: "summary", name: "摘要" }] },
    create: () => ({
      activate(context) {
        expect(context.ai.chat).toBe(unavailableAI.chat);
      },
    }),
  });
  host.registerDeferred(plugin, async () => plugin);
  await host.enable(plugin.id);
  expect(bind).toHaveBeenCalledOnce();
  expect(lifetime?.aborted).toBe(false);
  await host.disable(plugin.id);
  expect(lifetime?.aborted).toBe(true);
});

it("重复 AI 功能在激活前拒绝", async () => {
  const host = new PluginHost({ workspaceId: "test", storage: createMemoryStorage() });
  host.registerTrusted(
    definePlugin({
      id: "test.ai",
      name: "测试",
      version: "1.0.0",
      ai: {
        features: [
          { id: "same", name: "一" },
          { id: "same", name: "二" },
        ],
      },
    })
  );
  await expect(host.enable("test.ai")).rejects.toThrow("AI 功能名称或 ID 无效");
});
