import type { EventsAdapter } from "@tau/plugins/host";
import type { PluginDomainEvent } from "@tau/plugins";
import { off, on } from "@/electron";
import type { DomainEventMessage } from "@/types/domain-events";

const sameDatabase = (a: string, b: string) => a.replace(/\.db$/, "") === b.replace(/\.db$/, "");

/** 把主进程本库的业务事件转交给插件宿主；ID 转成与 context.data 一致的字符串。 */
export function createDesktopEvents(databaseName: string): EventsAdapter {
  return {
    subscribe(context, listener) {
      const handle = (_event: unknown, message: DomainEventMessage) => {
        if (context.signal.aborted || !sameDatabase(message.databaseName, databaseName)) return;
        for (const record of message.events) {
          const event: PluginDomainEvent = {
            type: record.type,
            at: record.at,
            ...(record.id === undefined ? {} : { id: String(record.id) }),
          };
          listener(event);
        }
      };
      on("domain-events", handle);
      return { dispose: () => off("domain-events", handle) };
    },
  };
}
