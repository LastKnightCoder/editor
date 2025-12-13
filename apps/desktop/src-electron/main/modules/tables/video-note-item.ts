import Database from "better-sqlite3";
import {
  CreateVideoNoteItemPayload,
  UpdateVideoNoteItemPayload,
  VideoNoteItem,
} from "@/types";
import ContentTable from "./content";

export default class VideoNoteItemTable {
  static initTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS video_note_item (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        video_note_id INTEGER NOT NULL,
        content_id INTEGER NOT NULL,
        title TEXT NOT NULL DEFAULT ''
      )
    `);
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_video_note_item_video ON video_note_item(video_note_id);`,
    );
  }

  static upgradeTable(_db: Database.Database) {
    // placeholder for future migrations
  }

  static parse(row: Record<string, unknown>): VideoNoteItem {
    return {
      id: row.id as number,
      createTime: row.create_time as number,
      updateTime: row.update_time as number,
      videoNoteId: row.video_note_id as number,
      contentId: row.content_id as number,
      title: row.title as string,
    };
  }

  static getListenEvents() {
    return {
      "video-note-item:create": this.create.bind(this),
      "video-note-item:update": this.update.bind(this),
      "video-note-item:get": this.getById.bind(this),
      "video-note-item:get-by-video-note-id": this.getByVideoNoteId.bind(this),
      "video-note-item:delete": this.remove.bind(this),
    };
  }

  static create(
    db: Database.Database,
    payload: CreateVideoNoteItemPayload,
  ): VideoNoteItem {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO video_note_item (create_time, update_time, video_note_id, content_id, title)
      VALUES (?, ?, ?, ?, ?)
    `);
    const res = stmt.run(
      now,
      now,
      payload.videoNoteId,
      payload.contentId,
      payload.title ?? "",
    );
    const note = this.getById(db, Number(res.lastInsertRowid));
    if (!note) {
      throw new Error("Failed to create video note item");
    }
    return note;
  }

  static update(
    db: Database.Database,
    payload: UpdateVideoNoteItemPayload,
  ): VideoNoteItem {
    const existing = db
      .prepare(`SELECT * FROM video_note_item WHERE id = ?`)
      .get(payload.id) as Record<string, unknown> | undefined;
    if (!existing) {
      throw new Error(`Video note item ${payload.id} not found`);
    }
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE video_note_item SET title = ?, update_time = ? WHERE id = ?
    `);
    stmt.run(payload.title ?? (existing.title as string), now, payload.id);
    const note = this.getById(db, payload.id);
    if (!note) {
      throw new Error("Failed to update video note item");
    }
    return note;
  }

  static getById(db: Database.Database, id: number): VideoNoteItem | null {
    const row = db
      .prepare(`SELECT * FROM video_note_item WHERE id = ?`)
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.parse(row) : null;
  }

  static getByVideoNoteId(
    db: Database.Database,
    videoNoteId: number,
  ): VideoNoteItem | null {
    const row = db
      .prepare(`SELECT * FROM video_note_item WHERE video_note_id = ?`)
      .get(videoNoteId) as Record<string, unknown> | undefined;
    return row ? this.parse(row) : null;
  }

  static remove(db: Database.Database, id: number): number {
    const existing = this.getById(db, id);
    if (!existing) {
      return 0;
    }
    const stmt = db.prepare(`DELETE FROM video_note_item WHERE id = ?`);
    const changes = stmt.run(id).changes;
    if (changes > 0) {
      ContentTable.deleteContent(db, existing.contentId);
    }
    return changes;
  }
}
