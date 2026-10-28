import { expect, it, vi } from "vitest";
import { PluginPermissionBroker, type PermissionSnapshot } from "../permission-host";
import { PluginHost, createMemoryStorage } from "../host";
import { definePlugin, type PluginContext } from "../index";

async function setup(snapshot: PermissionSnapshot = {}, foreground = true) {
  const write = vi.fn().mockResolvedValue(undefined);
  const broker = new PluginPermissionBroker(
    { read: async () => snapshot, write },
    () => foreground
  );
  const host = new PluginHost({
    workspaceId: "fixture",
    storage: createMemoryStorage(),
    permissions: broker,
  });
  let context!: PluginContext;
  host.registerTrusted({
    ...definePlugin({
      id: "test.permission",
      name: "测试",
      version: "1.0.0",
      create: () => ({
        activate(value) {
          context = value;
        },
      }),
    }),
    permissions: ["cards:read", "cards:write"],
  });
  await host.enable("test.permission");
  return {
    broker,
    host,
    write,
    get context() {
      return context;
    },
  };
}
it("仅本次授权在停用后消失，持久授权不跨插件", async () => {
  const fixture = await setup({ other: { "cards:read": "granted" } });
  const request = fixture.context.permissions.request(["cards:read"]);
  await vi.waitFor(() => expect(fixture.broker.prompts).toHaveLength(1));
  await fixture.broker.prompts[0].decide("once");
  expect(await request).toBe(true);
  expect(await fixture.context.permissions.query("cards:read")).toBe("granted");
  expect(fixture.write).not.toHaveBeenCalled();
  await fixture.host.disable("test.permission");
  await fixture.host.enable("test.permission");
  expect(await fixture.context.permissions.query("cards:read")).toBe("prompt");
  await fixture.host.dispose();
  fixture.broker.dispose();
});
it("始终允许先保存，撤权清除持久决定", async () => {
  const fixture = await setup();
  const request = fixture.context.permissions.request(["cards:write"]);
  await vi.waitFor(() => expect(fixture.broker.prompts).toHaveLength(1));
  await fixture.broker.prompts[0].decide("always");
  expect(await request).toBe(true);
  expect(fixture.write).toHaveBeenCalledWith("test.permission", "cards:write", "granted");
  await fixture.broker.reset("test.permission", "cards:write");
  expect(await fixture.context.permissions.query("cards:write")).toBe("prompt");
  await fixture.host.dispose();
  fixture.broker.dispose();
});
it("后台请求不弹窗、不授予，记录待处理权限", async () => {
  const fixture = await setup({}, false);
  expect(await fixture.context.permissions.request(["cards:read"])).toBe(false);
  expect(fixture.broker.prompts).toHaveLength(0);
  expect(fixture.broker.pendingFor("test.permission")).toEqual(["cards:read"]);
  await fixture.host.dispose();
  fixture.broker.dispose();
});
it("停用终结等待，迟到的界面答复不能授权", async () => {
  const fixture = await setup();
  const result = fixture.context.permissions.request(["cards:read"]).catch(error => error);
  await vi.waitFor(() => expect(fixture.broker.prompts).toHaveLength(1));
  const prompt = fixture.broker.prompts[0];
  await fixture.host.disable("test.permission");
  expect(await result).toBeInstanceOf(Error);
  await expect(prompt.decide("always")).rejects.toThrow();
  expect(fixture.write).not.toHaveBeenCalled();
  expect(fixture.broker.prompts).toHaveLength(0);
  await fixture.host.dispose();
  fixture.broker.dispose();
});
it("损坏存储不能被解释成空授权继续申请", async () => {
  const broker = new PluginPermissionBroker(
    {
      read: async () => {
        throw new Error("损坏");
      },
      write: vi.fn(),
    },
    () => true
  );
  const context = { pluginId: "test", signal: new AbortController().signal } as PluginContext;
  await expect(broker.query(context, "cards:read")).rejects.toThrow("损坏");
  expect(broker.prompts).toHaveLength(0);
  broker.dispose();
});

it("同一激活实例的重复请求共用已确认决定，不重复弹窗", async () => {
  const fixture = await setup();
  const first = fixture.context.permissions.request(["cards:read"]);
  const second = fixture.context.permissions.request(["cards:read"]);
  await vi.waitFor(() => expect(fixture.broker.prompts).toHaveLength(2));
  await fixture.broker.prompts[0].decide("once");
  expect(await Promise.all([first, second])).toEqual([true, true]);
  expect(fixture.broker.prompts).toHaveLength(0);
  await fixture.host.dispose();
  fixture.broker.dispose();
});
it("跨激活连续拒绝三次阻止，解除后恢复询问", async () => {
  const fixture = await setup();
  for (let index = 0; index < 3; index++) {
    const pending = fixture.context.permissions.request(["cards:read"]);
    await vi.waitFor(() => expect(fixture.broker.prompts).toHaveLength(1));
    await fixture.broker.prompts[0].decide("deny");
    expect(await pending).toBe(false);
    await fixture.host.disable("test.permission");
    await fixture.host.enable("test.permission");
  }
  expect(await fixture.context.permissions.query("cards:read")).toBe("denied");
  expect(fixture.write).toHaveBeenCalledWith("test.permission", "cards:read", "blocked");
  await fixture.broker.reset("test.permission", "cards:read");
  expect(await fixture.context.permissions.query("cards:read")).toBe("prompt");
  await fixture.host.dispose();
  fixture.broker.dispose();
});
