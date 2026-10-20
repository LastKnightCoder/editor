import { invoke } from "@/electron";
import { withModule } from "./module-init";
import type {
  PluginPermissionGrant,
  PluginPermissionSnapshot,
  PluginPermissionUsage,
  PluginUsageKind,
} from "@/types/plugin-permissions";

const request = <T>(channel: string, ...args: unknown[]) =>
  withModule("plugin-permissions", () => invoke<T>(channel, ...args));

export const getPluginPermissionSnapshot = (workspaceId: string) =>
  request<PluginPermissionSnapshot>("plugin-permissions:snapshot", workspaceId);

export const setPluginPermission = (
  workspaceId: string,
  pluginId: string,
  permission: string,
  grant: PluginPermissionGrant | null
) => request<void>("plugin-permissions:set", workspaceId, pluginId, permission, grant);

export const recordPluginUsage = (
  workspaceId: string,
  pluginId: string,
  counts: Partial<Record<PluginUsageKind, number>>
) => request<void>("plugin-permissions:record", workspaceId, pluginId, counts);

export const getPluginUsage = (workspaceId: string, pluginId: string) =>
  request<PluginPermissionUsage>("plugin-permissions:usage", workspaceId, pluginId);
