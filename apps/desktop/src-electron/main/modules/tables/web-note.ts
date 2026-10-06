import Database from "better-sqlite3";
import { CreateWebNotePayload, UpdateWebNotePayload, WebNote } from "@/types";
import ContentTable from "./content";

export default class WebNoteTable {
  static parse(row: Record<string, unknown>): WebNote {
    return {
      id: row.id as number,
      createTime: row.create_time as number,
      updateTime: row.update_time as number,
      projectItemId: row.project_item_id as number,
      contentId: row.content_id as number,
      title: row.title as string,
    };
  }

  static getListenEvents() {
    return {
      "web-note:create": this.create.bind(this),
      "web-note:update": this.update.bind(this),
      "web-note:get": this.getById.bind(this),
      "web-note:list-by-project-item": this.listByProjectItemId.bind(this),
      "web-note:delete": this.remove.bind(this),
    };
  }

  static create(db: Database.Database, payload: CreateWebNotePayload): WebNote {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO web_note (create_time, update_time, project_item_id, content_id, title)
      VALUES (?, ?, ?, ?, ?)
    `);
    const res = stmt.run(now, now, payload.projectItemId, payload.contentId, payload.title);
    const note = this.getById(db, Number(res.lastInsertRowid));
    if (!note) {
      throw new Error("Failed to create web note");
    }
    return note;
  }

  static update(db: Database.Database, payload: UpdateWebNotePayload): WebNote {
    const existing = db.prepare(`SELECT * FROM web_note WHERE id = ?`).get(payload.id) as
      Record<string, unknown> | undefined;
    if (!existing) {
      throw new Error(`Web note ${payload.id} not found`);
    }
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE web_note SET title = ?, update_time = ? WHERE id = ?
    `);
    stmt.run(payload.title ?? (existing.title as string), now, payload.id);
    const note = this.getById(db, payload.id);
    if (!note) {
      throw new Error("Failed to update web note");
    }
    return note;
  }

  static getById(db: Database.Database, id: number): WebNote | null {
    const row = db.prepare(`SELECT * FROM web_note WHERE id = ?`).get(id) as
      Record<string, unknown> | undefined;
    return row ? this.parse(row) : null;
  }

  static listByProjectItemId(db: Database.Database, projectItemId: number): WebNote[] {
    const rows = db
      .prepare(`SELECT * FROM web_note WHERE project_item_id = ? ORDER BY create_time ASC`)
      .all(projectItemId) as Record<string, unknown>[];
    return rows.map(row => this.parse(row));
  }

  static remove(db: Database.Database, id: number): number {
    const existing = this.getById(db, id);
    if (!existing) {
      return 0;
    }
    const stmt = db.prepare(`DELETE FROM web_note WHERE id = ?`);
    const changes = stmt.run(id).changes;
    if (changes > 0) {
      ContentTable.deleteContent(db, existing.contentId);
    }
    return changes;
  }
}
