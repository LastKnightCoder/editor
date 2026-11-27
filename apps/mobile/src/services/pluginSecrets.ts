import { invoke } from "@tauri-apps/api/core";
import type { PluginSecrets } from "@tau/plugins";
import type { StorageScope } from "@tau/plugins/host";

function secretAccess(
  workspaceId: string,
  pluginId: string,
  operation: string,
  key?: string,
  value?: string
) {
  return invoke<{ value?: string }>("plugin:plugin-secrets|access", {
    namespace: JSON.stringify([workspaceId, pluginId]),
    operation,
    key,
    value,
  });
}

export function mobilePluginSecrets({ workspaceId, pluginId }: StorageScope): PluginSecrets {
  return {
    get: async key => (await secretAccess(workspaceId, pluginId, "get", key)).value,
    set: async (key, value) => {
      await secretAccess(workspaceId, pluginId, "set", key, value);
    },
    delete: async key => {
      await secretAccess(workspaceId, pluginId, "delete", key);
    },
  };
}

export const clearMobilePluginSecrets = (workspaceId: string, pluginId: string) =>
  secretAccess(workspaceId, pluginId, "clear");
