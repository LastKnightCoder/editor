import type { EventsAdapter } from "@tau/plugins/host";
import type { PluginDomainEvent } from "@tau/plugins";
import { off, on } from "@/electron";
import type { DomainEventMessage } from "@/types/domain-events";

const sameDatabase = (a: string, b: string) => a.replace(/\.db$/, "") === b.replace(/\.db$/, "");

/**
 * 把主进程本库的业务事件转交给插件宿主；ID 转成与 context.data 一致的字符串。
 * 插件实体与记录的事件只交给拥有它的插件。
 */
export function createDesktopEvents(databaseName: string): EventsAdapter {
  return {
    subscribe(context, listener) {
      const handle = (_event: unknown, message: DomainEventMessage) => {
        if (context.signal.aborted || !sameDatabase(message.databaseName, databaseName)) return;
        for (const record of message.events) {
          if (
            (record.type.startsWith("entity.") || record.type.startsWith("record.")) &&
            record.owner !== context.pluginId
          )
            continue;
          const event: PluginDomainEvent = {
            type: record.type,
            at: record.at,
            origin: record.pluginId
              ? { kind: "plugin", pluginId: record.pluginId }
              : { kind: "app" },
            ...(record.id === undefined ? {} : { id: String(record.id) }),
            ...(record.kind === undefined ? {} : { kind: record.kind }),
            ...(record.collection === undefined ? {} : { collection: record.collection }),
          };
          listener(event);
        }
      };
      on("domain-events", handle);
      return { dispose: () => off("domain-events", handle) };
    },
  };
}
