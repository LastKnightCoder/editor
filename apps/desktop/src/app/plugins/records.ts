import type { PluginContext, PluginRecord } from "@tau/plugins";
import type { RecordsAdapter } from "@tau/plugins/host";
import {
  countPluginRecords,
  deletePluginRecord,
  getPluginRecord,
  insertPluginRecord,
  queryPluginRecords,
  updatePluginRecord,
} from "@/commands/plugin-records";
import { bindDatabaseCommands } from "@/services/command-context";
import type { PluginRecordRow } from "@/types/plugin-records";
import { mapConflict } from "./data";

const toRecord = (row: PluginRecordRow): PluginRecord => row as PluginRecord;

/** 插件记录：按插件 ID 只读写自己的记录，命令固定到 Provider 创建宿主时的库并带实例 signal */
export function createDesktopRecords(databaseName: string): RecordsAdapter {
  const bound = (context: PluginContext) =>
    bindDatabaseCommands(
      {
        insertPluginRecord,
        getPluginRecord,
        queryPluginRecords,
        countPluginRecords,
        updatePluginRecord,
        deletePluginRecord,
      },
      { databaseName, signal: context.signal }
    );
  return {
    async insert(context, collection, { id, data }, indexes) {
      return toRecord(
        await mapConflict(() =>
          bound(context).insertPluginRecord(
            databaseName,
            context.pluginId,
            collection,
            id,
            data,
            indexes
          )
        )
      );
    },
    async get(context, collection, id) {
      const row = await bound(context).getPluginRecord(
        databaseName,
        context.pluginId,
        collection,
        id
      );
      return row ? toRecord(row) : null;
    },
    async query(context, collection, query) {
      const page = await bound(context).queryPluginRecords(
        databaseName,
        context.pluginId,
        collection,
        query
      );
      return { items: page.items.map(toRecord), ...(page.cursor ? { cursor: page.cursor } : {}) };
    },
    count: (context, collection, where) =>
      bound(context).countPluginRecords(databaseName, context.pluginId, collection, where),
    async update(context, collection, id, data, expectedRevision, indexes) {
      return toRecord(
        await mapConflict(() =>
          bound(context).updatePluginRecord(
            databaseName,
            context.pluginId,
            collection,
            id,
            data,
            expectedRevision,
            indexes
          )
        )
      );
    },
    async delete(context, collection, id, expectedRevision) {
      await mapConflict(() =>
        bound(context).deletePluginRecord(
          databaseName,
          context.pluginId,
          collection,
          id,
          expectedRevision
        )
      );
    },
  };
}
