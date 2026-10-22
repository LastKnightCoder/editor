/**
 * 插件关联的行级操作，供实体删除、恢复与孤儿回收使用；不依赖引用解析，避免实体模块的依赖链变长。
 */
import Database from "better-sqlite3";

export interface LinkRow {
  id: string;
  plugin_id: string;
  from_id: number;
  to_kind: string;
  to_id: string;
  to_created_at: number;
  role: string;
  sort_index: number;
  data: string;
  create_time: number;
}

export const LINK_COLUMNS = `id, plugin_id, from_id, to_kind, to_id, to_created_at, role, sort_index, data,
  create_time`;

export const PluginLinkRows = {
  /** 实体删除前取出它的出边，随实体快照保存 */
  snapshot(db: Database.Database, from: number): LinkRow[] {
    return db
      .prepare(
        `SELECT ${LINK_COLUMNS} FROM plugin_links WHERE from_id = ? ORDER BY role, sort_index`
      )
      .all(from) as LinkRow[];
  },

  removeFrom(db: Database.Database, from: number) {
    db.prepare("DELETE FROM plugin_links WHERE from_id = ?").run(from);
  },

  /** 实体恢复后插回出边；ID 已被占用的跳过 */
  restore(db: Database.Database, rows: unknown) {
    if (!Array.isArray(rows)) return;
    const insert = db.prepare(
      `INSERT OR IGNORE INTO plugin_links (${LINK_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const row of rows as LinkRow[])
      insert.run(
        row.id,
        row.plugin_id,
        row.from_id,
        row.to_kind,
        row.to_id,
        row.to_created_at,
        row.role,
        row.sort_index,
        row.data,
        row.create_time
      );
  },
};
