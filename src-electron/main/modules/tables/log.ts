import Database from "better-sqlite3";
import { Descendant } from "slate";
import ContentTable from "./content";
import DailyNoteTable from "./daily-note";
import { BrowserWindow } from "electron";

export type PeriodType = "day" | "week" | "month" | "year";

export interface LogEntry {
  id: number;
  create_time: number;
  update_time: number;
  period_type: PeriodType;
  start_date: number; // ms timestamp at start
  end_date: number; // ms timestamp at end (inclusive bound semantics on UI)
  title: string;
  tags: string[];
  content_id: number;
  content: Descendant[];
}

export default class LogTable {
  static initTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS log_entries (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        period_type TEXT NOT NULL,
        start_date INTEGER NOT NULL,
        end_date INTEGER NOT NULL,
        title TEXT,
        tags TEXT,
        content_id INTEGER
      )
    `);
  }

  static upgradeTable(db: Database.Database) {
    // 将 daily_notes 迁移为 period_type=day 的日志，仅迁移一次
    try {
      const migratedFlag = db
        .prepare("SELECT 1 FROM log_entries WHERE period_type='day' LIMIT 1")
        .get();
      if (migratedFlag) return;
    } catch {
      // ignore
    }

    try {
      const notes = DailyNoteTable.getAllDailyNotes(db);
      const insertStmt = db.prepare(
        `INSERT INTO log_entries (create_time, update_time, period_type, start_date, end_date, title, tags, content_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const note of notes) {
        const start = new Date(note.date + "T00:00:00").getTime();
        const end = start + 24 * 60 * 60 * 1000 - 1;
        insertStmt.run(
          Date.now(),
          Date.now(),
          "day",
          start,
          end,
          `${note.date} 日记`,
          JSON.stringify([]),
          note.contentId,
        );
      }
    } catch (e) {
      // ignore migration errors to avoid blocking
    }
  }

  static getListenEvents() {
    return {
      "create-log": this.createLog.bind(this),
      "update-log": this.updateLog.bind(this),
      "delete-log": this.deleteLog.bind(this),
      "get-log-by-id": this.getLogById.bind(this),
      "get-logs-by-period": this.getLogsByPeriod.bind(this),
      "get-logs-by-range": this.getLogsByRange.bind(this),
      "get-all-logs": this.getAllLogs.bind(this),
    };
  }

  static parse(row: any): LogEntry {
    return {
      id: row.id,
      create_time: row.create_time,
      update_time: row.update_time,
      period_type: row.period_type,
      start_date: row.start_date,
      end_date: row.end_date,
      title: row.title || "",
      tags: JSON.parse(row.tags || "[]"),
      content_id: row.content_id,
      content: row.content ? JSON.parse(row.content) : [],
    };
  }

  static createLog(
    db: Database.Database,
    params: {
      periodType: PeriodType;
      startDate: number;
      endDate: number;
      title?: string;
      tags?: string[];
      content?: Descendant[];
    },
  ): LogEntry {
    const contentId = ContentTable.createContent(db, {
      content: params.content || [],
    });
    const stmt = db.prepare(
      `INSERT INTO log_entries (create_time, update_time, period_type, start_date, end_date, title, tags, content_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const now = Date.now();
    const res = stmt.run(
      now,
      now,
      params.periodType,
      params.startDate,
      params.endDate,
      params.title || "",
      JSON.stringify(params.tags || []),
      contentId,
    );
    return this.getLogById(db, Number(res.lastInsertRowid));
  }

  static updateLog(
    db: Database.Database,
    params: {
      id: number;
      title?: string;
      tags?: string[];
      content?: Descendant[];
    },
    win: BrowserWindow,
  ): LogEntry {
    const current = this.getLogById(db, params.id);
    if (!current) throw new Error("Log not found");
    if (params.content) {
      ContentTable.updateContent(
        db,
        current.content_id,
        {
          content: params.content,
        },
        win,
      );
    }
    const stmt = db.prepare(
      `UPDATE log_entries SET update_time = ?, title = ?, tags = ? WHERE id = ?`,
    );
    stmt.run(
      Date.now(),
      params.title ?? current.title,
      JSON.stringify(params.tags ?? current.tags),
      params.id,
    );
    return this.getLogById(db, params.id);
  }

  static deleteLog(db: Database.Database, id: number): number {
    const current = this.getLogById(db, id);
    const stmt = db.prepare(`DELETE FROM log_entries WHERE id = ?`);
    const changes = stmt.run(id).changes;
    if (changes > 0 && current?.content_id) {
      ContentTable.deleteContent(db, current.content_id);
    }
    return changes;
  }

  static getLogById(db: Database.Database, id: number): LogEntry {
    const stmt = db.prepare(
      `SELECT l.*, c.content FROM log_entries l LEFT JOIN contents c ON l.content_id = c.id WHERE l.id = ?`,
    );
    const row = stmt.get(id);
    return this.parse(row);
  }

  static getAllLogs(db: Database.Database): LogEntry[] {
    const stmt = db.prepare(
      `SELECT l.*, c.content FROM log_entries l LEFT JOIN contents c ON l.content_id = c.id ORDER BY l.create_time DESC`,
    );
    return stmt.all().map(this.parse);
  }

  static getLogsByPeriod(
    db: Database.Database,
    params: { periodType: PeriodType; startDate: number; endDate: number },
  ): LogEntry[] {
    const stmt = db.prepare(
      `SELECT l.*, c.content FROM log_entries l LEFT JOIN contents c ON l.content_id = c.id
       WHERE l.start_date >= ? AND l.start_date <= ? AND l.period_type = ?
       ORDER BY l.start_date ASC`,
    );
    return stmt
      .all(params.startDate, params.endDate, params.periodType)
      .map(this.parse);
  }

  static getLogsByRange(
    db: Database.Database,
    params: { startDate: number; endDate: number; periodTypes?: PeriodType[] },
  ): LogEntry[] {
    const { startDate, endDate, periodTypes } = params;
    let sql = `SELECT l.*, c.content FROM log_entries l LEFT JOIN contents c ON l.content_id = c.id WHERE l.start_date >= ? AND l.start_date <= ?`;
    const values: any[] = [startDate, endDate];
    if (periodTypes && periodTypes.length > 0) {
      sql += ` AND l.period_type IN (${periodTypes.map(() => "?").join(",")})`;
      values.push(...periodTypes);
    }
    sql += ` ORDER BY l.start_date ASC`;
    const stmt = db.prepare(sql);
    // @ts-ignore
    return stmt.all(...values).map(this.parse);
  }
}
