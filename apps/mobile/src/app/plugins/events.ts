import { invoke } from "@tauri-apps/api/core";
import type { EventsAdapter } from "@tau/plugins/host";
import type { PluginDomainEvent } from "@tau/plugins";

/** 消费已提交操作日志，用户编辑、协作投影和插件写入共用同一来源。 */
export async function createMobileEvents(database: string, token: string, changed: () => void) {
  const listeners = new Set<(event: PluginDomainEvent) => void>();
  const read = (after: number | null) =>
    invoke<{ cursor: number; events: PluginDomainEvent[] }>("plugin_data_read", {
      database,
      token,
      pluginId: "host",
      request: { method: "changes", after },
    });
  let cursor = (await read(null)).cursor;
  let disposed = false;
  let running = false;
  const poll = async () => {
    if (disposed || running || globalThis.document?.visibilityState === "hidden") return;
    running = true;
    try {
      const batch = await read(listeners.size ? cursor : null);
      if (disposed) return;
      cursor = batch.cursor;
      const events = new Map(batch.events.map(event => [`${event.type}:${event.id ?? ""}`, event]));
      if (events.size) changed();
      for (const event of events.values()) for (const listener of listeners) listener(event);
    } catch (error) {
      if (!disposed) console.warn("插件业务事件读取失败", error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void poll(), 2000);
  const foreground = () => void poll();
  globalThis.document?.addEventListener("visibilitychange", foreground);
  const adapter: EventsAdapter = {
    subscribe(context, listener) {
      const receive = (event: PluginDomainEvent) => {
        if (!context.signal.aborted) listener(event);
      };
      listeners.add(receive);
      return {
        dispose: () => {
          listeners.delete(receive);
        },
      };
    },
  };
  return {
    adapter,
    dispose() {
      disposed = true;
      clearInterval(timer);
      globalThis.document?.removeEventListener("visibilitychange", foreground);
      listeners.clear();
    },
  };
}
