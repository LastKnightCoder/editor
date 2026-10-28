import { beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { createMobileEvents } from "./events";
import { definePlugin, type PluginContext, type PluginDomainEvent } from "@tau/plugins";
import { createMemoryStorage, PluginHost } from "@tau/plugins/host";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
beforeEach(() => vi.mocked(invoke).mockReset());
it("仅投递提交事件、合并重复更新，停用后不继续通知", async () => {
  vi.useFakeTimers();
  vi.mocked(invoke)
    .mockResolvedValueOnce({ cursor: 1, events: [] })
    .mockResolvedValue({
      cursor: 3,
      events: [
        { type: "card.updated", id: "1", at: 2, origin: { kind: "app" } },
        { type: "card.updated", id: "1", at: 3, origin: { kind: "plugin", pluginId: "example" } },
      ],
    });
  const changed = vi.fn();
  const listener = vi.fn();
  const controller = new AbortController();
  const events = await createMobileEvents("one.db", "session", changed);
  const subscription = events.adapter.subscribe(
    { pluginId: "example", signal: controller.signal } as PluginContext,
    listener
  );
  try {
    await vi.advanceTimersByTimeAsync(2000);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ at: 3, origin: { kind: "plugin", pluginId: "example" } })
    );
    controller.abort();
    await vi.advanceTimersByTimeAsync(2000);
    expect(listener).toHaveBeenCalledOnce();
  } finally {
    subscription.dispose();
    events.dispose();
    vi.useRealTimers();
  }
});

async function ownEvents(batch: Array<PluginDomainEvent & { ownerPluginId?: string }>) {
  vi.mocked(invoke)
    .mockResolvedValueOnce({ cursor: 0, events: [] })
    .mockResolvedValueOnce({ cursor: 1, events: batch })
    .mockResolvedValue({ cursor: 1, events: [] });
  const events = await createMobileEvents("one.db", "session", vi.fn());
  const host = new PluginHost({
    workspaceId: "one.db",
    storage: createMemoryStorage(),
    events: events.adapter,
  });
  const listeners = new Map<string, ReturnType<typeof vi.fn>>();
  for (const id of ["owner", "writer", "other"]) {
    const listener = vi.fn();
    listeners.set(id, listener);
    host.registerTrusted(
      definePlugin({
        id,
        name: id,
        version: "1",
        create: () => ({
          activate(context) {
            context.events.on(["entity.updated", "entity.deleted", "record.deleted"], listener);
          },
        }),
      })
    );
    await host.enable(id);
  }
  return {
    listener(id: string) {
      const listener = listeners.get(id);
      if (!listener) throw new Error("测试监听器不存在");
      return listener;
    },
    async close() {
      events.dispose();
      await host.dispose();
    },
  };
}

it("实体与记录删除只送真实拥有者，保留类型和集合但不暴露宿主owner字段", async () => {
  vi.useFakeTimers();
  const entity: PluginDomainEvent = {
    type: "entity.deleted",
    id: "7",
    kind: "note",
    at: 1,
    origin: { kind: "plugin", pluginId: "writer" },
  };
  const record: PluginDomainEvent = {
    type: "record.deleted",
    id: "record-1",
    collection: "items",
    at: 2,
    origin: { kind: "plugin", pluginId: "writer" },
  };
  const current = await ownEvents([
    { ...entity, ownerPluginId: "owner" },
    { ...record, ownerPluginId: "owner" },
  ]);
  try {
    await vi.advanceTimersByTimeAsync(2000);
    expect(current.listener("owner").mock.calls.map(([event]) => event)).toEqual([entity, record]);
    expect(current.listener("writer")).not.toHaveBeenCalled();
    expect(current.listener("other")).not.toHaveBeenCalled();
    for (const [event] of current.listener("owner").mock.calls)
      expect(event).not.toHaveProperty("ownerPluginId");
  } finally {
    await current.close();
    vi.useRealTimers();
  }
});

it("事件去重保留拥有者维度，缺失归属时不根据origin猜测或广播", async () => {
  vi.useFakeTimers();
  const current = await ownEvents([
    {
      type: "entity.updated",
      id: "7",
      kind: "note",
      at: 1,
      origin: { kind: "app" },
      ownerPluginId: "owner",
    },
    {
      type: "entity.updated",
      id: "7",
      kind: "note",
      at: 2,
      origin: { kind: "plugin", pluginId: "owner" },
      ownerPluginId: "writer",
    },
    {
      type: "entity.updated",
      id: "7",
      kind: "note",
      at: 3,
      origin: { kind: "app" },
      ownerPluginId: "owner",
    },
    {
      type: "entity.deleted",
      id: "8",
      kind: "note",
      at: 4,
      origin: { kind: "plugin", pluginId: "owner" },
    },
    { type: "record.deleted", id: "record-1", collection: "items", at: 5, origin: { kind: "app" } },
  ]);
  try {
    await vi.advanceTimersByTimeAsync(2000);
    expect(current.listener("owner")).toHaveBeenCalledOnce();
    expect(current.listener("owner")).toHaveBeenCalledWith({
      type: "entity.updated",
      id: "7",
      kind: "note",
      at: 3,
      origin: { kind: "app" },
    });
    expect(current.listener("writer")).toHaveBeenCalledOnce();
    expect(current.listener("writer")).toHaveBeenCalledWith({
      type: "entity.updated",
      id: "7",
      kind: "note",
      at: 2,
      origin: { kind: "plugin", pluginId: "owner" },
    });
    expect(current.listener("other")).not.toHaveBeenCalled();
  } finally {
    await current.close();
    vi.useRealTimers();
  }
});
