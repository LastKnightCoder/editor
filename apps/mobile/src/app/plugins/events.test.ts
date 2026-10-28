import { expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { createMobileEvents } from "./events";
import type { PluginContext } from "@tau/plugins";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
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
