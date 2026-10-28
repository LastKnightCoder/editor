import { invoke } from "@tauri-apps/api/core";
import { PluginPermissionBroker, type PermissionSnapshot } from "@tau/plugins/permission-host";

export function createMobilePermissions(database: string, token: string) {
  return new PluginPermissionBroker(
    {
      usage: pluginId =>
        invoke("plugin_permissions_usage", { database, token, pluginId, counts: null }),
      recover: () => invoke("plugin_permissions_reset", { database, token }),
      record: (pluginId, counts) =>
        invoke("plugin_permissions_usage", { database, token, pluginId, counts }).then(
          () => undefined
        ),
      read: () => invoke<PermissionSnapshot>("plugin_permissions_read", { database, token }),
      write: (pluginId, permission, grant) =>
        invoke("plugin_permissions_write", { database, token, pluginId, permission, grant }),
    },
    () => globalThis.document?.visibilityState === "visible"
  );
}
