import { invoke } from "@tauri-apps/api/core";
import type { EventsAdapter } from "@tau/plugins/host";
import type { PluginDomainEvent } from "@tau/plugins";

type HostedEvent = PluginDomainEvent & { ownerPluginId?: string };

/** 消费已提交操作日志，用户编辑、协作投影和插件写入共用同一来源。 */
export async function createMobileEvents(database: string, token: string, changed: () => void) {
  const listeners = new Set<(event: HostedEvent) => void>();
  const read = (after: number | null, dataAfter: number | null) =>
    invoke<{ cursor: number; dataCursor: number; hasMore?: boolean; events: HostedEvent[] }>(
      "plugin_data_read",
      {
        database,
        token,
        pluginId: "host",
        request: { method: "changes", after, dataAfter },
      }
    );
  const initial = await read(null, null);
  if (!Number.isSafeInteger(initial.dataCursor)) throw new Error("当前事件来源未提供对象水位");
  let cursor = initial.cursor;
  let dataCursor = initial.dataCursor;
  let followup: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let running = false;
  const poll = async () => {
    if (disposed || running || globalThis.document?.visibilityState === "hidden") return;
    running = true;
    try {
      const batch = await read(listeners.size ? cursor : null, listeners.size ? dataCursor : null);
      if (disposed) return;
      if (!Number.isSafeInteger(batch.dataCursor)) throw new Error("对象事件水位无效");
      cursor = batch.cursor;
      dataCursor = batch.dataCursor;
      const events = new Map(
        batch.events.map(event => [
          JSON.stringify([event.ownerPluginId, event.type, event.id]),
          event,
        ])
      );
      if (events.size) changed();
      for (const event of events.values()) for (const listener of listeners) listener(event);
      if (batch.hasMore && !disposed) followup = setTimeout(() => void poll(), 0);
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
      const receive = (event: HostedEvent) => {
        if (context.signal.aborted) return;
        if (
          (event.type.startsWith("entity.") || event.type.startsWith("record.")) &&
          event.ownerPluginId !== context.pluginId
        )
          return;
        const publicEvent = { ...event };
        delete publicEvent.ownerPluginId;
        listener(publicEvent);
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
      if (followup) clearTimeout(followup);
      globalThis.document?.removeEventListener("visibilitychange", foreground);
      listeners.clear();
    },
  };
}
