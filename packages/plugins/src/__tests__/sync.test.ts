import { expect, it, vi } from "vitest";
import { PluginHost, createMemoryStorage } from "../host";
import { definePlugin } from "../index";

it("同步贡献通过正常激活注册，停用自动注销，不执行提供方工厂", async () => {
  const dispose = vi.fn(),
    create = vi.fn(),
    register = vi.fn(() => ({ dispose }));
  const host = new PluginHost({
    workspaceId: "test",
    storage: createMemoryStorage(),
    sync: { register },
  });
  host.registerTrusted(
    definePlugin({
      id: "test.sync",
      name: "test",
      version: "1.0.0",
      create: () => ({
        activate(context) {
          context.sync.register({ id: context.pluginId, name: "test", create });
        },
      }),
    })
  );
  await host.enable("test.sync");
  expect(register).toHaveBeenCalledOnce();
  expect(create).not.toHaveBeenCalled();
  await host.disable("test.sync");
  expect(dispose).toHaveBeenCalledOnce();
  await host.dispose();
});

it("同步贡献不能冒用其他插件身份", async () => {
  const register = vi.fn();
  const host = new PluginHost({
    workspaceId: "test",
    storage: createMemoryStorage(),
    sync: { register },
  });
  host.registerTrusted(
    definePlugin({
      id: "test.sync",
      name: "test",
      version: "1.0.0",
      create: () => ({
        activate(context) {
          context.sync.register({ id: "other.sync", name: "test", create: vi.fn() });
        },
      }),
    })
  );
  await expect(host.enable("test.sync")).rejects.toThrow("属于当前插件");
  expect(register).not.toHaveBeenCalled();
  await host.dispose();
});
