import Database from "better-sqlite3";
import { DailyNote } from "@/types/daily_note";
import Operation from "./operation";

export default class DailyNoteTable {
  static initTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS daily_notes (
        id INTEGER PRIMARY KEY NOT NULL,
        content TEXT NOT NULL,
        date TEXT NOT NULL UNIQUE
      )
    `);
  }

  static upgradeTable(_db: Database.Database) {
    // 暂时无升级
  }

  static getListenEvents() {
    return {
      "create-daily-note": this.createDailyNote.bind(this),
      "update-daily-note": this.updateDailyNote.bind(this),
      "delete-daily-note": this.deleteDailyNote.bind(this),
      "get-daily-note-by-id": this.getDailyNoteById.bind(this),
      "get-daily-note-by-date": this.getDailyNoteByDate.bind(this),
      "get-all-daily-notes": this.getAllDailyNotes.bind(this),
    };
  }

  static parseDailyNote(note: any): DailyNote {
    return {
      ...note,
      content: JSON.parse(note.content),
    };
  }

  static createDailyNote(
    db: Database.Database,
    note: Omit<DailyNote, "id">,
  ): DailyNote {
    const stmt = db.prepare(`
      INSERT INTO daily_notes (content, date)
      VALUES (?, ?)
    `);
    const res = stmt.run(JSON.stringify(note.content), note.date);

    Operation.insertOperation(
      db,
      "daily-note",
      "insert",
      res.lastInsertRowid,
      Date.now(),
    );

    return this.getDailyNoteById(db, Number(res.lastInsertRowid));
  }

  static updateDailyNote(
    db: Database.Database,
    note: Omit<DailyNote, "date">,
  ): DailyNote {
    const stmt = db.prepare(`
      UPDATE daily_notes SET
        content = ?
      WHERE id = ?
    `);
    stmt.run(JSON.stringify(note.content), note.id);

    Operation.insertOperation(db, "daily-note", "update", note.id, Date.now());

    return this.getDailyNoteById(db, note.id);
  }

  static deleteDailyNote(db: Database.Database, id: number): number {
    const stmt = db.prepare("DELETE FROM daily_notes WHERE id = ?");
    Operation.insertOperation(db, "daily-note", "delete", id, Date.now());
    return stmt.run(id).changes;
  }

  static getDailyNoteById(db: Database.Database, id: number): DailyNote {
    const stmt = db.prepare("SELECT * FROM daily_notes WHERE id = ?");
    const note = stmt.get(id);
    return this.parseDailyNote(note);
  }

  static getDailyNoteByDate(db: Database.Database, date: string): DailyNote {
    const stmt = db.prepare("SELECT * FROM daily_notes WHERE date = ?");
    const note = stmt.get(date);
    return this.parseDailyNote(note);
  }

  static getAllDailyNotes(db: Database.Database): DailyNote[] {
    const stmt = db.prepare("SELECT * FROM daily_notes");
    const notes = stmt.all();
    return notes.map((note) => this.parseDailyNote(note));
  }
}
