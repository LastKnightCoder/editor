import type { PluginContext, PluginOwnEntity } from "@tau/plugins";
import type { EntitiesAdapter } from "@tau/plugins/host";
import {
  createPluginEntity,
  findPluginEntity,
  getPluginEntity,
  queryPluginEntities,
  updatePluginEntity,
} from "@/commands/plugin-entities";
import { bindDatabaseCommands } from "@/services/command-context";
import type { PluginEntityRecord } from "@/types/plugin-entities";
import { encodeContentRef, mapConflict } from "./data";

function toEntity(record: PluginEntityRecord): PluginOwnEntity {
  return {
    id: String(record.id),
    kind: record.kind,
    key: record.key,
    title: record.title,
    contentRef: encodeContentRef(record.contentId, record.contentCreatedAt),
    meta: record.meta as PluginOwnEntity["meta"],
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    revision: record.revision,
  };
}

const numericId = (id: string) => {
  const value = Number(id);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
};

/** 插件实体：按插件 ID 只读写自己的内容，命令固定到 Provider 创建宿主时的库并带实例 signal */
export function createDesktopEntities(databaseName: string): EntitiesAdapter {
  const bound = (context: PluginContext) =>
    bindDatabaseCommands(
      {
        createPluginEntity,
        getPluginEntity,
        findPluginEntity,
        queryPluginEntities,
        updatePluginEntity,
      },
      { databaseName, signal: context.signal }
    );
  return {
    async create(context, input) {
      return toEntity(
        await mapConflict(() =>
          bound(context).createPluginEntity(databaseName, context.pluginId, input)
        )
      );
    },
    async get(context, id) {
      const numeric = numericId(id);
      if (!numeric) return null;
      const record = await bound(context).getPluginEntity(databaseName, context.pluginId, numeric);
      return record ? toEntity(record) : null;
    },
    async find(context, kind, key) {
      const record = await bound(context).findPluginEntity(
        databaseName,
        context.pluginId,
        kind,
        key
      );
      return record ? toEntity(record) : null;
    },
    async query(context, query) {
      const page = await bound(context).queryPluginEntities(databaseName, context.pluginId, query);
      return { items: page.items.map(toEntity), ...(page.cursor ? { cursor: page.cursor } : {}) };
    },
    async update(context, id, patch, expectedRevision) {
      const numeric = numericId(id);
      if (!numeric) throw new Error("内容不存在");
      return toEntity(
        await mapConflict(() =>
          bound(context).updatePluginEntity(
            databaseName,
            context.pluginId,
            numeric,
            patch,
            expectedRevision
          )
        )
      );
    },
  };
}
