import Database from "better-sqlite3";

/** 可恢复操作的保留期，与正文延迟回收的宽限期一致 */
export const PLUGIN_OPERATION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** 登记一次插件删除：payload 是恢复所需的快照或撤销凭据；顺带清掉超过保留期的记录 */
export function insertPluginOperation(
  db: Database.Database,
  operation: {
    pluginId: string;
    entity: string;
    entityId: string;
    title: string;
    payload: unknown;
  }
) {
  const now = Date.now();
  db.prepare("DELETE FROM plugin_operations WHERE create_time < ?").run(
    now - PLUGIN_OPERATION_RETENTION_MS
  );
  db.prepare(
    `INSERT INTO plugin_operations (plugin_id, action, entity, entity_id, title, payload, create_time)
     VALUES (?, 'delete', ?, ?, ?, ?, ?)`
  ).run(
    operation.pluginId,
    operation.entity,
    operation.entityId,
    operation.title,
    JSON.stringify(operation.payload),
    now
  );
}
