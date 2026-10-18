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

it.each([false, true])("同步与MCP共存，激活失败=%s时资源按同一生命周期回收", async fail => {
  const syncDispose = vi.fn();
  const mcpDispose = vi.fn();
  const syncRegister = vi.fn(() => ({ dispose: syncDispose }));
  const mcpRegister = vi.fn(() => ({ dispose: mcpDispose }));
  const host = new PluginHost({
    workspaceId: "test",
    storage: createMemoryStorage(),
    sync: { register: syncRegister },
    mcp: { register: mcpRegister },
  });
  host.registerTrusted(
    definePlugin({
      id: "test.combined",
      name: "combined",
      version: "1.0.0",
      create: () => ({
        activate(context) {
          context.sync.register({ id: context.pluginId, name: "storage", create: vi.fn() });
          context.mcp.register({
            id: "tools",
            name: "tools",
            tools: [
              {
                name: "read",
                description: "读取测试值",
                inputSchema: { type: "object" },
                execute: () => ({ content: "ok" }),
              },
            ],
          });
          expect(mcpRegister).not.toHaveBeenCalled();
          if (fail) throw new Error("activation failed");
        },
      }),
    })
  );
  if (fail) {
    await expect(host.enable("test.combined")).rejects.toThrow("activation failed");
    expect(mcpRegister).not.toHaveBeenCalled();
  } else {
    await host.enable("test.combined");
    expect(mcpRegister).toHaveBeenCalledOnce();
    await host.disable("test.combined");
    expect(mcpDispose).toHaveBeenCalledOnce();
  }
  expect(syncRegister).toHaveBeenCalledOnce();
  expect(syncDispose).toHaveBeenCalledOnce();
  await host.dispose();
});
