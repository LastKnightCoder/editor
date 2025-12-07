import Database from "better-sqlite3";
import {
  Shortcut,
  CreateShortcutPayload,
  UpdateShortcutPayload,
  ShortcutResourceType,
  ShortcutScope,
} from "@/types";

export default class ShortcutTable {
  static initTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS shortcuts (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        sort_index INTEGER NOT NULL DEFAULT 0,
        resource_type TEXT NOT NULL CHECK(resource_type IN ('card', 'article', 'document', 'project')),
        scope TEXT NOT NULL CHECK(scope IN ('module', 'item')),
        resource_id INTEGER,
        project_item_id INTEGER,
        document_item_id INTEGER,
        title TEXT NOT NULL,
        meta TEXT
      )
    `);

    // 创建唯一索引防止重复
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_shortcuts_unique 
      ON shortcuts(resource_type, scope, resource_id, project_item_id, document_item_id)
    `);

    // 创建排序索引
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_shortcuts_sort 
      ON shortcuts(sort_index, update_time)
    `);
  }

  static upgradeTable(_db: Database.Database) {
    // 预留给未来 schema 迁移
  }

  static getListenEvents() {
    return {
      "shortcut:list": this.listShortcuts.bind(this),
      "shortcut:create": this.createShortcut.bind(this),
      "shortcut:update": this.updateShortcut.bind(this),
      "shortcut:delete": this.deleteShortcut.bind(this),
      "shortcut:reorder": this.reorderShortcuts.bind(this),
      "shortcut:find": this.findShortcut.bind(this),
    } as const;
  }

  static parse(row: any): Shortcut {
    return {
      id: row.id,
      createTime: row.create_time,
      updateTime: row.update_time,
      sortIndex: row.sort_index,
      resourceType: row.resource_type as ShortcutResourceType,
      scope: row.scope as ShortcutScope,
      resourceId: row.resource_id ?? undefined,
      projectItemId: row.project_item_id ?? undefined,
      documentItemId: row.document_item_id ?? undefined,
      title: row.title,
      meta: row.meta ? JSON.parse(row.meta) : {},
    };
  }

  static listShortcuts(db: Database.Database): Shortcut[] {
    const stmt = db.prepare(`
      SELECT * FROM shortcuts 
      ORDER BY sort_index ASC, update_time DESC
    `);
    const rows = stmt.all();
    return rows.map((row) => this.parse(row));
  }

  static getMaxSortIndex(db: Database.Database): number {
    const row = db
      .prepare(`SELECT MAX(sort_index) AS max_idx FROM shortcuts`)
      .get() as { max_idx: number | null };
    return row?.max_idx ?? 0;
  }

  static createShortcut(
    db: Database.Database,
    payload: CreateShortcutPayload,
  ): Shortcut {
    const now = Date.now();
    const sortIndex = this.getMaxSortIndex(db) + 1024;

    const stmt = db.prepare(`
      INSERT INTO shortcuts (
        create_time, 
        update_time, 
        sort_index, 
        resource_type, 
        scope, 
        resource_id, 
        project_item_id, 
        document_item_id, 
        title, 
        meta
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const res = stmt.run(
      now,
      now,
      sortIndex,
      payload.resourceType,
      payload.scope,
      payload.resourceId ?? null,
      payload.projectItemId ?? null,
      payload.documentItemId ?? null,
      payload.title,
      JSON.stringify(payload.meta ?? {}),
    );

    const id = Number(res.lastInsertRowid);
    const created = db.prepare(`SELECT * FROM shortcuts WHERE id = ?`).get(id);
    return this.parse(created);
  }

  static updateShortcut(
    db: Database.Database,
    payload: UpdateShortcutPayload,
  ): Shortcut {
    const now = Date.now();

    const current = db
      .prepare(`SELECT * FROM shortcuts WHERE id = ?`)
      .get(payload.id) as any;

    if (!current) {
      throw new Error(`Shortcut with id ${payload.id} not found`);
    }

    const title = payload.title ?? current.title;
    const sortIndex = payload.sortIndex ?? current.sort_index;
    const meta =
      payload.meta !== undefined ? JSON.stringify(payload.meta) : current.meta;

    const stmt = db.prepare(`
      UPDATE shortcuts 
      SET title = ?, sort_index = ?, meta = ?, update_time = ?
      WHERE id = ?
    `);

    stmt.run(title, sortIndex, meta, now, payload.id);

    const updated = db
      .prepare(`SELECT * FROM shortcuts WHERE id = ?`)
      .get(payload.id);
    return this.parse(updated);
  }

  static deleteShortcut(db: Database.Database, id: number): number {
    const stmt = db.prepare(`DELETE FROM shortcuts WHERE id = ?`);
    const res = stmt.run(id);
    return res.changes;
  }

  static reorderShortcuts(
    db: Database.Database,
    payload: { orderedIds: number[] },
  ): number {
    const ids = payload.orderedIds;
    const step = 1024;
    const now = Date.now();

    const stmt = db.prepare(`
      UPDATE shortcuts 
      SET sort_index = ?, update_time = ? 
      WHERE id = ?
    `);

    ids.forEach((id, idx) => {
      stmt.run((idx + 1) * step, now, id);
    });

    return ids.length;
  }

  static findShortcut(
    db: Database.Database,
    params: {
      resourceType: ShortcutResourceType;
      scope: ShortcutScope;
      resourceId?: number;
      projectItemId?: number;
      documentItemId?: number;
    },
  ): Shortcut | null {
    const stmt = db.prepare(`
      SELECT * FROM shortcuts 
      WHERE resource_type = ? 
        AND scope = ? 
        AND (resource_id IS ? OR (resource_id IS NULL AND ? IS NULL))
        AND (project_item_id IS ? OR (project_item_id IS NULL AND ? IS NULL))
        AND (document_item_id IS ? OR (document_item_id IS NULL AND ? IS NULL))
      LIMIT 1
    `);

    const row = stmt.get(
      params.resourceType,
      params.scope,
      params.resourceId ?? null,
      params.resourceId ?? null,
      params.projectItemId ?? null,
      params.projectItemId ?? null,
      params.documentItemId ?? null,
      params.documentItemId ?? null,
    );

    return row ? this.parse(row) : null;
  }
}
