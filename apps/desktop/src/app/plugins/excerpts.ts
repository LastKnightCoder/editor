import type { ExcerptsAdapter, MaterialsAdapter } from "@tau/plugins/host";
import type { PluginContext, PluginExcerptEntry } from "@tau/plugins";
import * as excerptCommands from "@/commands/excerpt";
import { bindDatabaseCommands } from "@/services/command-context";
import { registerExcerptOpener } from "@/services/excerpt-providers";

/**
 * 桌面摘录提供方适配：来源类型即插件 ID；写入固定到宿主创建时的数据库，并随插件实例的 signal 取消。
 * 提供方名称在 register 时异步登记，首次写入前等待登记完成，失败随写入报出。
 */
export function createDesktopExcerpts(databaseName: string): {
  excerpts: ExcerptsAdapter;
  materials: MaterialsAdapter;
} {
  const commands = (context: PluginContext) =>
    bindDatabaseCommands(excerptCommands, { databaseName, signal: context.signal });
  const registrations = new WeakMap<PluginContext, Promise<void>>();
  const registered = async (context: PluginContext) => {
    const pending = registrations.get(context);
    if (!pending) throw new Error("写入摘录前须先注册摘录提供方");
    await pending;
  };

  const excerpts: ExcerptsAdapter = {
    register(context, definition) {
      const pending = commands(context).registerExcerptProvider(context.pluginId, definition.label);
      void pending.catch(() => undefined);
      registrations.set(context, pending);
      const open = definition.open;
      // 未提供 open 的提供方不登记，打开原处直接回落到摘录外链
      const unregister = open
        ? registerExcerptOpener(context.pluginId, async target => {
            context.signal.throwIfAborted();
            await open(target);
          })
        : () => undefined;
      return {
        dispose: () => {
          if (registrations.get(context) === pending) registrations.delete(context);
          unregister();
        },
      };
    },
    async replace(context, source, items) {
      await registered(context);
      return commands(context).replaceProviderExcerpts(context.pluginId, source, items);
    },
    async patch(context, source, change) {
      await registered(context);
      return commands(context).patchProviderExcerpts(context.pluginId, source, change);
    },
    sources: context => commands(context).listProviderExcerptSources(context.pluginId),
    async items(context, sourceKey) {
      const rows = await commands(context).listProviderExcerpts(context.pluginId, sourceKey);
      return rows.map(row => ({
        ref: { kind: "excerpt", id: row.id },
        externalId: row.externalId,
        quote: row.quote,
        note: row.note,
        location: row.location,
        url: row.url,
        anchor: row.anchor as PluginExcerptEntry["anchor"],
        color: row.color,
        time: row.sourceTime,
        deleted: row.isDeleted,
      }));
    },
  };

  const materials: MaterialsAdapter = {
    async actions(_context, ref) {
      // 动作依赖卡片、问题等业务模块，按需加载，不拖重插件宿主的启动
      const { materialActions, parseMaterialRef } = await import("@/services/material-actions");
      return materialActions(parseMaterialRef(ref));
    },
  };
  return { excerpts, materials };
}
