import type { NotificationsAdapter } from "@tau/plugins/host";
import { appNotify } from "@/features/notifications/notify";

export const desktopPluginNotifications: NotificationsAdapter = {
  send(context, plugin, options) {
    context.signal.throwIfAborted();
    const { mode = "auto", actions, ...content } = options;
    const id = appNotify(
      { ...content, source: plugin.name, actions: actions ? [...actions] : undefined },
      mode === "auto" ? undefined : { force: mode }
    );
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      context.signal.removeEventListener("abort", dispose);
      appNotify.dismiss(id);
    };
    context.signal.addEventListener("abort", dispose, { once: true });
    return { dispose };
  },
};
