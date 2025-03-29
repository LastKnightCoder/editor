import Database from "better-sqlite3";
import { DailyNote } from "@/types/daily_note";
import Operation from "./operation";
import ContentTable from "./content";
import { getContentLength } from "@/utils/helper.ts";
import log from "electron-log";

export default class DailyNoteTable {
  static initTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS daily_notes (
        id INTEGER PRIMARY KEY NOT NULL,
        content_id INTEGER,
        date TEXT NOT NULL UNIQUE,
        FOREIGN KEY(content_id) REFERENCES contents(id)
      )
    `);
  }

  static upgradeTable(db: Database.Database) {
    const stmt = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'daily_notes'",
    );
    const tableInfo = (stmt.get() as { sql: string }).sql;

    // 如果不包含content_id字段，则添加
    if (!tableInfo.includes("content_id")) {
      // 1. 添加content_id列
      const addColumnStmt = db.prepare(
        "ALTER TABLE daily_notes ADD COLUMN content_id INTEGER",
      );
      addColumnStmt.run();

      // 2. 获取所有日记
      const getAllNotesStmt = db.prepare("SELECT * FROM daily_notes");
      const notes = getAllNotesStmt.all();

      // 3. 为每个日记创建内容表记录，并关联
      for (const note of notes as any[]) {
        try {
          // 创建content记录
          const content = JSON.parse(note.content as string);
          const count = getContentLength(content);

          const contentId = ContentTable.createContent(db, {
            content: content,
            count: count,
          });

          // 更新日记的content_id字段
          const updateNoteStmt = db.prepare(
            "UPDATE daily_notes SET content_id = ? WHERE id = ?",
          );
          updateNoteStmt.run(contentId, note.id);
        } catch (error) {
          log.error("迁移daily_notes记录错误:", error, "记录ID:", note.id);
        }
      }

      // 完成迁移后，可以选择保留content字段一段时间以确保迁移成功
      const dropContentColumnStmt = db.prepare(
        "ALTER TABLE daily_notes DROP COLUMN content",
      );
      dropContentColumnStmt.run();
    }
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
    let content = [];

    // 如果记录中有content字段（旧数据），直接使用
    if (note.content) {
      try {
        content = JSON.parse(note.content);
      } catch (error) {
        log.error("解析content错误:", error);
      }
    }

    return {
      id: note.id,
      date: note.date,
      content: content,
      contentId: note.content_id,
    };
  }

  static createDailyNote(
    db: Database.Database,
    note: Omit<DailyNote, "id">,
  ): DailyNote {
    // 创建content记录
    const contentId = ContentTable.createContent(db, {
      content: note.content,
      count: getContentLength(note.content),
    });

    // 创建daily_note记录
    const stmt = db.prepare(`
      INSERT INTO daily_notes (content_id, date)
      VALUES (?, ?)
    `);
    const res = stmt.run(contentId, note.date);

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
    // 获取现有记录
    const existingNote = this.getDailyNoteById(db, note.id);

    if (existingNote.contentId) {
      // 更新现有content记录
      ContentTable.updateContent(db, existingNote.contentId, {
        content: note.content,
        count: getContentLength(note.content),
      });
    } else {
      // 创建新的content记录
      const contentId = ContentTable.createContent(db, {
        content: note.content,
        count: getContentLength(note.content),
      });

      // 更新daily_note的content_id
      const updateContentIdStmt = db.prepare(
        "UPDATE daily_notes SET content_id = ? WHERE id = ?",
      );
      updateContentIdStmt.run(contentId, note.id);
    }

    // 记录操作
    Operation.insertOperation(db, "daily-note", "update", note.id, Date.now());

    return this.getDailyNoteById(db, note.id);
  }

  static deleteDailyNote(db: Database.Database, id: number): number {
    // 获取日记信息，以获取contentId
    const noteInfo = this.getDailyNoteById(db, id);

    if (noteInfo && noteInfo.contentId) {
      // 删除关联的content记录（减少引用计数）
      ContentTable.deleteContent(db, noteInfo.contentId);
    }

    // 删除daily_note记录
    const stmt = db.prepare("DELETE FROM daily_notes WHERE id = ?");
    Operation.insertOperation(db, "daily-note", "delete", id, Date.now());
    return stmt.run(id).changes;
  }

  static getDailyNoteById(db: Database.Database, id: number): DailyNote {
    const stmt = db.prepare(`
      SELECT d.id, d.date, d.content_id, c.content
      FROM daily_notes d
      LEFT JOIN contents c ON d.content_id = c.id
      WHERE d.id = ?
    `);
    const note = stmt.get(id);
    return this.parseDailyNote(note);
  }

  static getDailyNoteByDate(db: Database.Database, date: string): DailyNote {
    const stmt = db.prepare(`
      SELECT d.id, d.date, d.content_id, c.content
      FROM daily_notes d
      LEFT JOIN contents c ON d.content_id = c.id
      WHERE d.date = ?
    `);
    const note = stmt.get(date);
    return this.parseDailyNote(note);
  }

  static getAllDailyNotes(db: Database.Database): DailyNote[] {
    const stmt = db.prepare(`
      SELECT d.id, d.date, d.content_id, c.content
      FROM daily_notes d
      LEFT JOIN contents c ON d.content_id = c.id
      ORDER BY d.date DESC
    `);
    const notes = stmt.all();
    return notes.map((note) => this.parseDailyNote(note));
  }
}
