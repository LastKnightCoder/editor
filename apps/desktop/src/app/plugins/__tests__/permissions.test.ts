import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginContext } from "@tau/plugins";

const commands = vi.hoisted(() => ({
  snapshot: {} as Record<string, Record<string, "granted" | "blocked">>,
  set: vi.fn(async () => undefined),
  record: vi.fn(async () => undefined),
}));
vi.mock("@/electron", () => ({ on: vi.fn(), off: vi.fn() }));
vi.mock("@/commands/plugin-permissions", () => ({
  getPluginPermissionSnapshot: async () => commands.snapshot,
  setPluginPermission: commands.set,
  recordPluginUsage: commands.record,
  getPluginUsage: async () => ({ days: 7, read: 0 }),
}));

import { DesktopPermissionBroker, usePluginPermissionUi } from "../permissions";

const plugin = { id: "weekly", name: "每周回顾" };
const contextOf = (controller = new AbortController()) =>
  ({ pluginId: plugin.id, signal: controller.signal }) as PluginContext;
const answer = async (decision: "once" | "always" | "deny") => {
  await vi.waitFor(() =>
    expect(usePluginPermissionUi.getState().prompts.length).toBeGreaterThan(0)
  );
  usePluginPermissionUi.getState().prompts[0].settle(decision);
};

describe("DesktopPermissionBroker", () => {
  let foreground = true;
  let broker: DesktopPermissionBroker;
  beforeEach(() => {
    foreground = true;
    commands.snapshot = {};
    commands.set.mockClear();
    usePluginPermissionUi.setState({ prompts: [], pending: {} });
    broker = new DesktopPermissionBroker("w1", () => foreground);
  });
  afterEach(() => broker.dispose());

  it("仅这次只在当前激活实例内有效", async () => {
    const context = contextOf();
    const first = broker.ensure(context, plugin, ["cards:read"]);
    await answer("once");
    await first;
    await broker.ensure(context, plugin, ["cards:read"]);
    expect(usePluginPermissionUi.getState().prompts).toHaveLength(0);
    expect(commands.set).not.toHaveBeenCalled();

    const next = broker.ensure(contextOf(), plugin, ["cards:read"]);
    await answer("once");
    await next;
  });

  it("始终允许持久化后不再询问", async () => {
    const pending = broker.ensure(contextOf(), plugin, ["todos:read"]);
    await answer("always");
    await pending;
    expect(commands.set).toHaveBeenCalledWith("w1", "weekly", "todos:read", "granted");
    await broker.ensure(contextOf(), plugin, ["todos:read"]);
    expect(broker.rowState("weekly", "todos:read")).toBe("always");
  });

  it("本次拒绝不再重复询问，连续拒绝三次转为已阻止", async () => {
    for (let round = 0; round < 3; round++) {
      const context = contextOf();
      const pending = broker.ensure(context, plugin, ["cards:read"]);
      await answer("deny");
      await expect(pending).rejects.toMatchObject({ reason: "denied" });
      await expect(broker.ensure(context, plugin, ["cards:read"])).rejects.toMatchObject({
        reason: round < 2 ? "denied" : "blocked",
      });
    }
    expect(commands.set).toHaveBeenLastCalledWith("w1", "weekly", "cards:read", "blocked");
    await expect(broker.ensure(contextOf(), plugin, ["cards:read"])).rejects.toMatchObject({
      reason: "blocked",
    });
    expect(usePluginPermissionUi.getState().prompts).toHaveLength(0);
  });

  it("应用不在前台时不弹窗，请求记为待处理，由详情页处理", async () => {
    foreground = false;
    await expect(broker.ensure(contextOf(), plugin, ["calendar:read"])).rejects.toMatchObject({
      reason: "unavailable",
    });
    expect(usePluginPermissionUi.getState().pending).toEqual({ weekly: ["calendar:read"] });
    await broker.grant("weekly", "calendar:read", "always");
    expect(usePluginPermissionUi.getState().pending).toEqual({});
    await broker.ensure(contextOf(), plugin, ["calendar:read"]);
  });

  it("同一插件排队中的请求合并为一个弹窗", async () => {
    const context = contextOf();
    const shown = broker.ensure(context, plugin, ["cards:read"]);
    const queued = broker.ensure(context, plugin, ["todos:read"]);
    const merged = broker.ensure(context, plugin, ["articles:read"]);
    await vi.waitFor(() => expect(usePluginPermissionUi.getState().prompts).toHaveLength(2));
    expect(usePluginPermissionUi.getState().prompts[1].permissions).toEqual([
      "todos:read",
      "articles:read",
    ]);
    await answer("once");
    await shown;
    await answer("once");
    await Promise.all([queued, merged]);
    expect(usePluginPermissionUi.getState().prompts).toHaveLength(0);
  });

  it("插件停用时撤下它的弹窗，不计为拒绝", async () => {
    const controller = new AbortController();
    const pending = broker.ensure(contextOf(controller), plugin, ["cards:read"]);
    await vi.waitFor(() => expect(usePluginPermissionUi.getState().prompts).toHaveLength(1));
    controller.abort(new Error("停用"));
    await expect(pending).rejects.toThrow("停用");
    expect(usePluginPermissionUi.getState().prompts).toHaveLength(0);
    expect(commands.set).not.toHaveBeenCalled();
  });

  it("撤销后回到使用时询问", async () => {
    commands.snapshot = { weekly: { "cards:read": "granted" } };
    broker.dispose();
    broker = new DesktopPermissionBroker("w1", () => foreground);
    await broker.ensure(contextOf(), plugin, ["cards:read"]);
    await broker.reset("weekly", "cards:read");
    expect(commands.set).toHaveBeenCalledWith("w1", "weekly", "cards:read", null);
    expect(await broker.query(contextOf(), "cards:read")).toBe("prompt");
  });
});
