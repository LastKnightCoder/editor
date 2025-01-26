import { ipcMain } from 'electron';
import Database from 'better-sqlite3';
import { DailyNote } from '@/types/daily_note';

export default class DailyNoteTable {
  db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initTables();
    this.initHandlers();
  }

  initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daily_notes (
        id INTEGER PRIMARY KEY NOT NULL,
        content TEXT NOT NULL,
        date TEXT NOT NULL UNIQUE
      )
    `);
  }

  initHandlers() {
    ipcMain.handle('create-daily-note', async (_event, params: Omit<DailyNote, 'id'>) => {
      return await this.createDailyNote(params);
    });

    ipcMain.handle('update-daily-note', async (_event, params: Omit<DailyNote, 'date'>) => {
      return await this.updateDailyNote(params);
    });

    ipcMain.handle('delete-daily-note', async (_event, id: number) => {
      return await this.deleteDailyNote(id);
    });

    ipcMain.handle('get-daily-note-by-id', async (_event, id: number) => {
      return await this.getDailyNoteById(id);
    });

    ipcMain.handle('get-daily-note-by-date', async (_event, date: string) => {
      return await this.getDailyNoteByDate(date);
    });

    ipcMain.handle('get-all-daily-notes', async () => {
      return await this.getAllDailyNotes();
    });
  }

  parseDailyNote(note: any): DailyNote {
    return {
      ...note,
      content: JSON.parse(note.content)
    };
  }

  async createDailyNote(note: Omit<DailyNote, 'id'>): Promise<DailyNote> {
    const stmt = this.db.prepare(`
      INSERT INTO daily_notes (content, date)
      VALUES (?, ?)
    `);
    const res = stmt.run(
      JSON.stringify(note.content),
      note.date
    );
    return this.getDailyNoteById(Number(res.lastInsertRowid));
  }

  async updateDailyNote(note: Omit<DailyNote, 'date'>): Promise<DailyNote> {
    const stmt = this.db.prepare(`
      UPDATE daily_notes SET
        content = ?
      WHERE id = ?
    `);
    stmt.run(
      JSON.stringify(note.content),
      note.id
    );
    return this.getDailyNoteById(note.id);
  }

  async deleteDailyNote(id: number): Promise<number> {
    const stmt = this.db.prepare('DELETE FROM daily_notes WHERE id = ?');
    return stmt.run(id).changes;
  }

  async getDailyNoteById(id: number): Promise<DailyNote> {
    const stmt = this.db.prepare('SELECT * FROM daily_notes WHERE id = ?');
    const note = stmt.get(id);
    return this.parseDailyNote(note);
  }

  async getDailyNoteByDate(date: string): Promise<DailyNote> {
    const stmt = this.db.prepare('SELECT * FROM daily_notes WHERE date = ?');
    const note = stmt.get(date);
    return this.parseDailyNote(note);
  }

  async getAllDailyNotes(): Promise<DailyNote[]> {
    const stmt = this.db.prepare('SELECT * FROM daily_notes');
    const notes = stmt.all();
    return notes.map(note => this.parseDailyNote(note));
  }
}