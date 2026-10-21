import type { PluginContext, PluginOwnEntity } from "@tau/plugins";
import type { EntitiesAdapter } from "@tau/plugins/host";
import {
  createPluginEntity,
  declarePluginEntityKind,
  deletePluginEntity,
  findPluginEntity,
  getPluginEntity,
  queryPluginEntities,
  updatePluginEntity,
} from "@/commands/plugin-entities";
import { invalidatePluginEntityAppearance } from "@/services/plugin-entity-kinds";
import { renderPluginIconMarkup } from "./icon-markup";
import { bindDatabaseCommands } from "@/services/command-context";
import type { PluginEntityRecord } from "@/types/plugin-entities";
import { mapConflict, toContentSource } from "./data";
import { encodeContentRef } from "@/utils/plugin-content-ref";
import type { ContentOwnerEntity } from "@tau/plugins/host";
import useSettingStore from "@/stores/useSettingStore";

const BACKLINK_ENTITIES: Partial<Record<string, ContentOwnerEntity>> = {
  card: "card",
  article: "article",
  "project-item": "document",
};

/** 脉络查询按当前库执行：调用前后都要仍是创建宿主时的库 */
function assertDatabase(databaseName: string) {
  if (useSettingStore.getState().setting.database.active !== databaseName)
    throw new Error("数据库已切换，请重新读取");
}

export function toEntity(record: PluginEntityRecord): PluginOwnEntity {
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
        deletePluginEntity,
        declarePluginEntityKind,
      },
      { databaseName, signal: context.signal }
    );
  return {
    async create(context, { content, ...input }) {
      const request = { ...input, ...(content ? { content: toContentSource(content) } : {}) };
      return toEntity(
        await mapConflict(() =>
          bound(context).createPluginEntity(databaseName, context.pluginId, request)
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
    async backlinks(context, id) {
      const numeric = numericId(id);
      if (!numeric) throw new Error("内容不存在");
      const own = await bound(context).getPluginEntity(databaseName, context.pluginId, numeric);
      if (!own) throw new Error("内容不存在");
      assertDatabase(databaseName);
      // 按需加载：脉络命令不进插件宿主的启动路径
      const { getEntityContext } = await import("@/commands/entity-context");
      const result = await getEntityContext({ kind: "plugin-entity", id: numeric });
      context.signal.throwIfAborted();
      assertDatabase(databaseName);
      return (result?.backlinks ?? []).map(({ source, snippets }) => ({
        entity: BACKLINK_ENTITIES[source.ref.kind] ?? null,
        id: String(source.ref.id),
        title: source.title,
        snippets: snippets.map(({ before, label, after }) => ({ before, label, after })),
      }));
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
    async delete(context, id, expectedRevision) {
      const numeric = numericId(id);
      if (!numeric) throw new Error("内容不存在");
      await mapConflict(() =>
        bound(context).deletePluginEntity(databaseName, context.pluginId, numeric, expectedRevision)
      );
      invalidatePluginEntityAppearance();
    },
    // 外观随库保存，插件停用后仍按它显示，因此注销时不删除
    registerKind(context, definition) {
      void (async () => {
        const icon = definition.icon ? await renderPluginIconMarkup(definition.icon) : "";
        const changed = await bound(context).declarePluginEntityKind(
          databaseName,
          context.pluginId,
          { kind: definition.kind, label: definition.label, icon }
        );
        if (changed) invalidatePluginEntityAppearance();
      })().catch(error => {
        if (!context.signal.aborted)
          console.warn(`[plugin:${context.pluginId}] 类型 ${definition.kind} 的外观未保存`, error);
      });
      return { dispose: () => undefined };
    },
  };
}
