import type { PluginSecrets } from "@tau/plugins";
import type { StorageScope } from "@tau/plugins/host";
import { invoke } from "@/electron";
import type { PluginSecretCount } from "@/types/plugin-retained-data";
import { withModule } from "./module-init";

export function desktopPluginSecrets({
  workspaceId,
  pluginId,
  signal,
}: StorageScope): PluginSecrets {
  const request = <T>(operation: string, ...args: string[]) =>
    withModule("plugin-secrets", () => {
      signal.throwIfAborted();
      return invoke<T>(`plugin-secrets:${operation}`, workspaceId, pluginId, ...args);
    });
  return {
    get: key => request<string | undefined>("get", key),
    set: (key, value) => request<void>("set", key, value),
    delete: key => request<void>("delete", key),
  };
}

export const clearPluginSecrets = (workspaceId: string, pluginId: string) =>
  withModule("plugin-secrets", () => invoke<void>("plugin-secrets:clear", workspaceId, pluginId));

export const listPluginSecretsSummary = (workspaceId: string) =>
  withModule("plugin-secrets", () =>
    invoke<PluginSecretCount[]>("plugin-secrets:summary", workspaceId)
  );
