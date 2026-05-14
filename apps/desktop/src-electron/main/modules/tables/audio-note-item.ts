import Database from "better-sqlite3";
import { AudioNoteItem, CreateAudioNoteItem } from "@/types";
import ContentTable from "./content";

interface UpdateAudioNoteItemPayload {
  id: number;
  title?: string;
}

export default class AudioNoteItemTable {
  static upgradeTable(_db: Database.Database) {
    // placeholder for future migrations
  }

  static parse(row: Record<string, unknown>): AudioNoteItem {
    return {
      id: row.id as number,
      createTime: row.create_time as number,
      updateTime: row.update_time as number,
      audioNoteId: row.audio_note_id as number,
      contentId: row.content_id as number,
      title: row.title as string,
    };
  }

  static getListenEvents() {
    return {
      "audio-note-item:create": this.create.bind(this),
      "audio-note-item:update": this.update.bind(this),
      "audio-note-item:get": this.getById.bind(this),
      "audio-note-item:get-by-audio-note-id": this.getByAudioNoteId.bind(this),
      "audio-note-item:list-by-audio-note-id":
        this.listByAudioNoteId.bind(this),
      "audio-note-item:delete": this.remove.bind(this),
    };
  }

  static create(
    db: Database.Database,
    payload: CreateAudioNoteItem & { contentId: number },
  ): AudioNoteItem {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO audio_note_item (create_time, update_time, audio_note_id, content_id, title)
      VALUES (?, ?, ?, ?, ?)
    `);
    const res = stmt.run(
      now,
      now,
      payload.audioNoteId,
      payload.contentId,
      payload.title ?? "",
    );
    const note = this.getById(db, Number(res.lastInsertRowid));
    if (!note) {
      throw new Error("Failed to create audio note item");
    }
    return note;
  }

  static update(
    db: Database.Database,
    payload: UpdateAudioNoteItemPayload,
  ): AudioNoteItem {
    const existing = db
      .prepare(`SELECT * FROM audio_note_item WHERE id = ?`)
      .get(payload.id) as Record<string, unknown> | undefined;
    if (!existing) {
      throw new Error(`Audio note item ${payload.id} not found`);
    }
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE audio_note_item SET title = ?, update_time = ? WHERE id = ?
    `);
    stmt.run(payload.title ?? (existing.title as string), now, payload.id);
    const note = this.getById(db, payload.id);
    if (!note) {
      throw new Error("Failed to update audio note item");
    }
    return note;
  }

  static getById(db: Database.Database, id: number): AudioNoteItem | null {
    const row = db
      .prepare(`SELECT * FROM audio_note_item WHERE id = ?`)
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.parse(row) : null;
  }

  static getByAudioNoteId(
    db: Database.Database,
    audioNoteId: number,
  ): AudioNoteItem | null {
    const row = db
      .prepare(`SELECT * FROM audio_note_item WHERE audio_note_id = ?`)
      .get(audioNoteId) as Record<string, unknown> | undefined;
    return row ? this.parse(row) : null;
  }

  static listByAudioNoteId(
    db: Database.Database,
    audioNoteId: number,
  ): AudioNoteItem[] {
    const rows = db
      .prepare(
        `SELECT * FROM audio_note_item WHERE audio_note_id = ? ORDER BY create_time ASC`,
      )
      .all(audioNoteId) as Record<string, unknown>[];
    return rows.map((row) => this.parse(row));
  }

  static remove(db: Database.Database, id: number): number {
    const existing = this.getById(db, id);
    if (!existing) {
      return 0;
    }
    const stmt = db.prepare(`DELETE FROM audio_note_item WHERE id = ?`);
    const changes = stmt.run(id).changes;
    if (changes > 0) {
      ContentTable.deleteContent(db, existing.contentId);
    }
    return changes;
  }

  static removeByAudioNoteId(
    db: Database.Database,
    audioNoteId: number,
  ): number {
    const items = this.listByAudioNoteId(db, audioNoteId);
    let deleted = 0;
    for (const item of items) {
      deleted += this.remove(db, item.id);
    }
    return deleted;
  }
}
