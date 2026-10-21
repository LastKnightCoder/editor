import { describe, expect, it, vi } from "vitest";
import type { PluginContext, PluginDomainEvent } from "@tau/plugins";

const listeners = vi.hoisted(() => new Map<string, (...args: unknown[]) => void>());
vi.mock("@/electron", () => ({
  on: (channel: string, listener: (...args: unknown[]) => void) => listeners.set(channel, listener),
  off: (channel: string) => listeners.delete(channel),
}));

import { createDesktopEvents } from "../events";

const contextOf = (pluginId: string) =>
  ({ pluginId, signal: new AbortController().signal }) as unknown as PluginContext;

describe("桌面业务事件", () => {
  it("ID 转成字符串；插件实体的事件只交给所属插件并带类型", () => {
    const received: PluginDomainEvent[] = [];
    const subscription = createDesktopEvents("data").subscribe(contextOf("weekly"), event =>
      received.push(event)
    );
    listeners.get("domain-events")?.(
      {},
      {
        databaseName: "data.db",
        events: [
          { type: "whiteboard.updated", id: 3, at: 1 },
          { type: "material.created", id: "excerpt:2", at: 1, pluginId: "clip" },
          { type: "entity.updated", id: 5, at: 1, owner: "weekly", kind: "week" },
          { type: "entity.updated", id: 6, at: 1, owner: "other", kind: "note" },
        ],
      }
    );
    expect(received).toEqual([
      { type: "whiteboard.updated", id: "3", at: 1, origin: { kind: "app" } },
      {
        type: "material.created",
        id: "excerpt:2",
        at: 1,
        origin: { kind: "plugin", pluginId: "clip" },
      },
      { type: "entity.updated", id: "5", kind: "week", at: 1, origin: { kind: "app" } },
    ]);
    subscription.dispose();
    expect(listeners.has("domain-events")).toBe(false);
  });
});
