import type { NotificationsAdapter } from "@tau/plugins/host";
import { appNotify } from "@/services/notifications/notify";
import {
  isWindowAttended,
  currentDatabaseName,
  assertCurrentDatabase,
} from "@/services/notifications/aiNotify";
import { useSettingsStore } from "@/app/settingsStore";

export const desktopPluginNotifications: NotificationsAdapter = {
  send(context, plugin, options) {
    context.signal.throwIfAborted();
    const databaseName = currentDatabaseName();
    const { mode = "auto", actions, isOnSurface, ...content } = options;
    if (
      mode === "auto" &&
      isWindowAttended() &&
      !useSettingsStore.getState().open &&
      isOnSurface?.()
    )
      return { dispose: () => undefined };
    const id = appNotify(
      {
        ...content,
        source: plugin.name,
        actions: actions?.map(action => ({
          ...action,
          onClick: () => {
            context.signal.throwIfAborted();
            if (action.reveal) {
              assertCurrentDatabase(databaseName);
              useSettingsStore.getState().closeSettings();
            }
            return action.onClick();
          },
        })),
      },
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
