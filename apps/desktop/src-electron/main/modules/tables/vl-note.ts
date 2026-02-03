import Database from "better-sqlite3";
import ContentTable from "./content";

export type VLNoteType = "note" | "mindmap";

export interface VLNote {
  id: number;
  projectId: number;
  contentId: number;
  title: string;
  type: VLNoteType;
  createTime: number;
  updateTime: number;
}

export interface CreateVLNotePayload {
  projectId: number;
  contentId: number;
  title: string;
  type?: VLNoteType;
}

export interface UpdateVLNotePayload {
  id: number;
  title?: string;
}

export default class VLNoteTable {
  static initTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS vl_note (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        project_id INTEGER NOT NULL,
        content_id INTEGER NOT NULL,
        title TEXT NOT NULL
      )
    `);
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_vl_note_project ON vl_note(project_id);`,
    );
  }

  static upgradeTable(db: Database.Database) {
    // 添加 type 列，默认值为 'note'
    try {
      db.exec(
        `ALTER TABLE vl_note ADD COLUMN type TEXT NOT NULL DEFAULT 'note'`,
      );
    } catch {
      // 列已存在，忽略
    }
  }

  static parse(row: Record<string, unknown>): VLNote {
    return {
      id: row.id as number,
      createTime: row.create_time as number,
      updateTime: row.update_time as number,
      projectId: row.project_id as number,
      contentId: row.content_id as number,
      title: row.title as string,
      type: (row.type as VLNoteType) || "note",
    };
  }

  static getListenEvents() {
    return {
      "vl-note:create": this.create.bind(this),
      "vl-note:update": this.update.bind(this),
      "vl-note:get": this.getById.bind(this),
      "vl-note:list-by-project": this.listByProjectId.bind(this),
      "vl-note:delete": this.remove.bind(this),
    };
  }

  static create(db: Database.Database, payload: CreateVLNotePayload): VLNote {
    const now = Date.now();
    const noteType = payload.type || "note";
    const stmt = db.prepare(`
      INSERT INTO vl_note (create_time, update_time, project_id, content_id, title, type)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const res = stmt.run(
      now,
      now,
      payload.projectId,
      payload.contentId,
      payload.title,
      noteType,
    );
    const note = this.getById(db, Number(res.lastInsertRowid));
    if (!note) {
      throw new Error("Failed to create VL note");
    }
    return note;
  }

  static update(db: Database.Database, payload: UpdateVLNotePayload): VLNote {
    const existing = db
      .prepare(`SELECT * FROM vl_note WHERE id = ?`)
      .get(payload.id) as Record<string, unknown> | undefined;
    if (!existing) {
      throw new Error(`VL note ${payload.id} not found`);
    }
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE vl_note SET title = ?, update_time = ? WHERE id = ?
    `);
    stmt.run(payload.title ?? (existing.title as string), now, payload.id);
    const note = this.getById(db, payload.id);
    if (!note) {
      throw new Error("Failed to update VL note");
    }
    return note;
  }

  static getById(db: Database.Database, id: number): VLNote | null {
    const row = db.prepare(`SELECT * FROM vl_note WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.parse(row) : null;
  }

  static listByProjectId(db: Database.Database, projectId: number): VLNote[] {
    const rows = db
      .prepare(
        `SELECT * FROM vl_note WHERE project_id = ? ORDER BY update_time DESC`,
      )
      .all(projectId) as Record<string, unknown>[];
    return rows.map((row) => this.parse(row));
  }

  static remove(db: Database.Database, id: number): number {
    const existing = this.getById(db, id);
    if (!existing) {
      return 0;
    }
    const stmt = db.prepare(`DELETE FROM vl_note WHERE id = ?`);
    const changes = stmt.run(id).changes;
    if (changes > 0) {
      ContentTable.deleteContent(db, existing.contentId);
    }
    return changes;
  }
}
