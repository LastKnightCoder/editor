import Database from "better-sqlite3";
import { VideoNote } from "@/types";
import Operation from "./operation";

export default class VideoNoteTable {
  static initTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS video_notes (
        id INTEGER PRIMARY KEY,
        notes TEXT NOT NULL,
        count INTEGER NOT NULL,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        meta_info TEXT NOT NULL
      )
    `);
  }

  static upgradeTable(_db: Database.Database) {
    // TODO: 升级表结构
  }

  static getListenEvents() {
    return {
      "create-video-note": this.createVideoNote.bind(this),
      "update-video-note": this.updateVideoNote.bind(this),
      "delete-video-note": this.deleteVideoNote.bind(this),
      "get-video-note-by-id": this.getVideoNoteById.bind(this),
      "get-all-video-notes": this.getAllVideoNotes.bind(this),
    };
  }

  static parseVideoNote(note: any): VideoNote {
    return {
      id: note.id,
      notes: JSON.parse(note.notes),
      createTime: note.create_time,
      updateTime: note.update_time,
      metaInfo: JSON.parse(note.meta_info),
      count: note.count,
    };
  }

  static createVideoNote(
    db: Database.Database,
    note: Omit<VideoNote, "id" | "createTime" | "updateTime">,
  ): VideoNote {
    const stmt = db.prepare(`
      INSERT INTO video_notes (notes, create_time, update_time, meta_info, count)
      VALUES (?, ?, ?, ?, ?)
    `);

    const now = Date.now();
    const result = stmt.run(
      JSON.stringify(note.notes),
      now,
      now,
      JSON.stringify(note.metaInfo),
      note.count,
    );
    Operation.insertOperation(
      db,
      "video-note",
      "create",
      result.lastInsertRowid,
      Date.now(),
    );
    return this.getVideoNoteById(db, result.lastInsertRowid);
  }

  static getVideoNoteById(
    db: Database.Database,
    id: number | bigint,
  ): VideoNote {
    const stmt = db.prepare(`
      SELECT * FROM video_notes WHERE id = ?
    `);
    const note = stmt.get(id);
    return this.parseVideoNote(note);
  }

  static getAllVideoNotes(db: Database.Database): VideoNote[] {
    const stmt = db.prepare(`
      SELECT * FROM video_notes
    `);
    const notes = stmt.all();
    return notes.map((note) => this.parseVideoNote(note));
  }

  static updateVideoNote(
    db: Database.Database,
    note: Omit<VideoNote, "createTime" | "updateTime">,
  ): VideoNote {
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE video_notes SET notes = ?, update_time = ?, meta_info = ?, count = ? WHERE id = ?
    `);
    stmt.run(
      JSON.stringify(note.notes),
      now,
      JSON.stringify(note.metaInfo),
      note.count,
      note.id,
    );
    Operation.insertOperation(db, "video-note", "update", note.id, Date.now());
    return this.getVideoNoteById(db, note.id);
  }

  static deleteVideoNote(db: Database.Database, id: number): number {
    const stmt = db.prepare(`
      DELETE FROM video_notes WHERE id = ?
    `);
    const result = stmt.run(id);
    Operation.insertOperation(db, "video-note", "delete", id, Date.now());
    return result.changes;
  }
}
