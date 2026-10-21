import type { PluginEntityRef, PluginLink } from "@tau/plugins";
import { invoke } from "@/electron";

/** 插件关联命令；调用方经 bindDatabaseCommands 固定到插件宿主的数据库 */
export const addPluginLink = (
  databaseName: string,
  pluginId: string,
  link: { id: string; from: number; to: PluginEntityRef; role: string; data: unknown },
  readable: boolean
): Promise<PluginLink> => invoke("plugin-links:add", { databaseName, pluginId, ...link, readable });

export const listPluginLinks = (
  databaseName: string,
  pluginId: string,
  from: number,
  role?: string
): Promise<PluginLink[]> =>
  invoke("plugin-links:list", {
    databaseName,
    pluginId,
    from,
    ...(role === undefined ? {} : { role }),
  });

export const removePluginLink = (
  databaseName: string,
  pluginId: string,
  id: string
): Promise<void> => invoke("plugin-links:remove", { databaseName, pluginId, id });

export const reorderPluginLinks = (
  databaseName: string,
  pluginId: string,
  from: number,
  ids: string[]
): Promise<void> => invoke("plugin-links:reorder", { databaseName, pluginId, from, ids });
