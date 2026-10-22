import type { PluginContext } from "@tau/plugins";
import type { LinksAdapter } from "@tau/plugins/host";
import {
  addPluginLink,
  listPluginLinks,
  removePluginLink,
  reorderPluginLinks,
} from "@/commands/plugin-links";
import { bindDatabaseCommands } from "@/services/command-context";

const entityId = (id: string) => {
  const value = Number(id);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("内容不存在");
  return value;
};

/** 插件关联：来源为本插件的实体，命令固定到 Provider 创建宿主时的库并带实例 signal */
export function createDesktopLinks(databaseName: string): LinksAdapter {
  const bound = (context: PluginContext) =>
    bindDatabaseCommands(
      { addPluginLink, listPluginLinks, removePluginLink, reorderPluginLinks },
      { databaseName, signal: context.signal }
    );
  return {
    add: (context, { from, ...link }, readable) =>
      bound(context).addPluginLink(
        databaseName,
        context.pluginId,
        { ...link, from: entityId(from) },
        readable
      ),
    list: (context, from, role) =>
      bound(context).listPluginLinks(databaseName, context.pluginId, entityId(from), role),
    remove: (context, id) => bound(context).removePluginLink(databaseName, context.pluginId, id),
    reorder: (context, from, ids) =>
      bound(context).reorderPluginLinks(databaseName, context.pluginId, entityId(from), ids),
  };
}
