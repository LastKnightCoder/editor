import Database from "better-sqlite3";
import { BrowserWindow } from "electron";
import { basename } from "node:path";
import log from "electron-log";
import { ICreateJournal, IUpdateJournal, IJournal } from "@/types";

import Operation from "./operation";
import ContentTable from "./content";

export default class JournalTable {
  static getListenEvents() {
    return {
      "journal:create": this.createJournal.bind(this),
      "journal:update": this.updateJournal.bind(this),
      "journal:delete": this.deleteJournal.bind(this),
      "journal:get-by-id": this.getJournalById.bind(this),
      "journal:get-by-type": this.getJournalsByType.bind(this),
      "journal:get-all": this.getAllJournals.bind(this),
      "journal:get-by-time-range": this.getJournalsByTimeRange.bind(this),
      "journal:get-daily": this.getDailyJournal.bind(this),
      "journal:get-weekly": this.getWeeklyJournal.bind(this),
      "journal:get-monthly": this.getMonthlyJournal.bind(this),
      "journal:get-yearly": this.getYearlyJournal.bind(this),
    };
  }

  static initTable(db: Database.Database) {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS journals (
        id INTEGER PRIMARY KEY,
        type TEXT NOT NULL, -- 'daily', 'weekly', 'monthly', 'yearly'
        start_time INTEGER NOT NULL,
        end_time INTEGER NOT NULL,
        content_id INTEGER
      )
    `;
    db.exec(createTableSql);
  }

  static upgradeTable(_db: Database.Database) {
    // 未来版本升级时使用
  }

  static parseJournal(journal: any): IJournal {
    let content = [];
    let count = 0;

    // 处理JOIN查询结果中的内容
    if (journal.content) {
      try {
        content = JSON.parse(journal.content);
        count = journal.count || 0;
      } catch (error) {
        log.error("Error parsing journal content:", error);
      }
    }

    return {
      id: journal.id,
      type: journal.type,
      startTime: journal.start_time,
      endTime: journal.end_time,
      content: content,
      count: count,
      contentId: journal.content_id,
    };
  }

  static getJournalById(
    db: Database.Database,
    journalId: number | bigint,
  ): IJournal | null {
    const stmt = db.prepare(`
      SELECT j.id, j.type, j.start_time, j.end_time, j.content_id,
             c.content, c.count
      FROM journals j
      LEFT JOIN contents c ON j.content_id = c.id
      WHERE j.id = ?
    `);
    const journal = stmt.get(journalId);
    if (!journal) {
      return null;
    }
    return this.parseJournal(journal);
  }

  static getAllJournals(db: Database.Database): IJournal[] {
    const stmt = db.prepare(`
      SELECT j.id, j.type, j.start_time, j.end_time, j.content_id,
             c.content, c.count
      FROM journals j
      LEFT JOIN contents c ON j.content_id = c.id
      ORDER BY j.start_time DESC
    `);
    const journals = stmt.all();
    return journals.map((journal) => this.parseJournal(journal));
  }

  static getJournalsByType(db: Database.Database, type: string): IJournal[] {
    const stmt = db.prepare(`
      SELECT j.id, j.type, j.start_time, j.end_time, j.content_id,
             c.content, c.count
      FROM journals j
      LEFT JOIN contents c ON j.content_id = c.id
      WHERE j.type = ?
      ORDER BY j.start_time DESC
    `);
    const journals = stmt.all(type);
    return journals.map((journal) => this.parseJournal(journal));
  }

  static getJournalsByTimeRange(
    db: Database.Database,
    startTime: number,
    endTime: number,
  ): IJournal[] {
    const stmt = db.prepare(`
      SELECT j.id, j.type, j.start_time, j.end_time, j.content_id,
             c.content, c.count
      FROM journals j
      LEFT JOIN contents c ON j.content_id = c.id
      WHERE (j.start_time <= ? AND j.end_time >= ?) 
         OR (j.start_time >= ? AND j.start_time <= ?)
         OR (j.end_time >= ? AND j.end_time <= ?)
      ORDER BY j.start_time DESC
    `);
    const journals = stmt.all(
      endTime,
      startTime,
      startTime,
      endTime,
      startTime,
      endTime,
    );
    return journals.map((journal) => this.parseJournal(journal));
  }

  static createJournal(
    db: Database.Database,
    journalData: ICreateJournal,
  ): IJournal {
    const { type, startTime, endTime, content, count } = journalData;

    // 创建content记录
    const contentId = ContentTable.createContent(db, {
      content: content || [],
      count: count || 0,
    });

    // 创建journal记录
    const stmt = db.prepare(
      "INSERT INTO journals (type, start_time, end_time, content_id) VALUES (?, ?, ?, ?)",
    );
    const res = stmt.run(type, startTime, endTime, contentId);
    const createdJournalId = Number(res.lastInsertRowid);
    Operation.insertOperation(
      db,
      "journal",
      "insert",
      createdJournalId,
      Date.now(),
    );

    return this.getJournalById(db, createdJournalId) as IJournal;
  }

  static updateJournal(
    db: Database.Database,
    journalData: IUpdateJournal,
    win: BrowserWindow,
  ): IJournal | null {
    const { id, type, startTime, endTime } = journalData;

    // 更新journal记录
    const stmt = db.prepare(
      "UPDATE journals SET type = ?, start_time = ?, end_time = ? WHERE id = ?",
    );
    stmt.run(type, startTime, endTime, id);

    Operation.insertOperation(db, "journal", "update", id, Date.now());

    BrowserWindow.getAllWindows().forEach((window) => {
      if (window !== win && !window.isDestroyed()) {
        window.webContents.send("journal:updated", {
          databaseName: basename(db.name),
          journalId: id,
        });
      }
    });

    return this.getJournalById(db, id);
  }

  static deleteJournal(db: Database.Database, journalId: number): number {
    // 获取journal信息，以获取contentId
    const journalInfo = this.getJournalById(db, journalId);

    // 删除journal记录
    const stmt = db.prepare("DELETE FROM journals WHERE id = ?");
    const changes = stmt.run(journalId).changes;

    if (changes > 0 && journalInfo && journalInfo.contentId) {
      Operation.insertOperation(db, "journal", "delete", journalId, Date.now());

      // 删除关联的content记录（减少引用计数）
      ContentTable.deleteContent(db, journalInfo.contentId);
    }

    return changes;
  }

  static getDailyJournal(
    db: Database.Database,
    timestamp: number,
  ): IJournal | null {
    const date = new Date(timestamp);
    date.setHours(0, 0, 0, 0);
    const startTime = date.getTime();

    date.setHours(23, 59, 59, 999);
    const endTime = date.getTime();

    const stmt = db.prepare(`
      SELECT j.id, j.type, j.start_time, j.end_time, j.content_id,
             c.content, c.count
      FROM journals j
      LEFT JOIN contents c ON j.content_id = c.id
      WHERE j.type = 'daily' AND j.start_time = ? AND j.end_time = ?
    `);
    const journal = stmt.get(startTime, endTime);

    if (!journal) {
      return null;
    }
    return this.parseJournal(journal);
  }

  static getWeeklyJournal(
    db: Database.Database,
    timestamp: number,
  ): IJournal | null {
    const date = new Date(timestamp);
    // 获取本周一
    const day = date.getDay() || 7; // 如果是周日，getDay()返回0，转为7
    const diffToMonday = day - 1;
    date.setDate(date.getDate() - diffToMonday);
    date.setHours(0, 0, 0, 0);
    const startTime = date.getTime();

    // 获取本周日
    const sunday = new Date(startTime);
    sunday.setDate(sunday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    const endTime = sunday.getTime();

    const stmt = db.prepare(`
      SELECT j.id, j.type, j.start_time, j.end_time, j.content_id,
             c.content, c.count
      FROM journals j
      LEFT JOIN contents c ON j.content_id = c.id
      WHERE j.type = 'weekly' AND j.start_time = ? AND j.end_time = ?
    `);
    const journal = stmt.get(startTime, endTime);

    if (!journal) {
      return null;
    }
    return this.parseJournal(journal);
  }

  static getMonthlyJournal(
    db: Database.Database,
    timestamp: number,
  ): IJournal | null {
    const date = new Date(timestamp);
    // 月初
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
    const startTime = date.getTime();

    // 月末
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    lastDay.setHours(23, 59, 59, 999);
    const endTime = lastDay.getTime();

    const stmt = db.prepare(`
      SELECT j.id, j.type, j.start_time, j.end_time, j.content_id,
             c.content, c.count
      FROM journals j
      LEFT JOIN contents c ON j.content_id = c.id
      WHERE j.type = 'monthly' AND j.start_time = ? AND j.end_time = ?
    `);
    const journal = stmt.get(startTime, endTime);

    if (!journal) {
      return null;
    }
    return this.parseJournal(journal);
  }

  static getYearlyJournal(
    db: Database.Database,
    timestamp: number,
  ): IJournal | null {
    const date = new Date(timestamp);
    // 年初
    date.setMonth(0, 1);
    date.setHours(0, 0, 0, 0);
    const startTime = date.getTime();

    // 年末
    const lastDay = new Date(date.getFullYear(), 11, 31);
    lastDay.setHours(23, 59, 59, 999);
    const endTime = lastDay.getTime();

    const stmt = db.prepare(`
      SELECT j.id, j.type, j.start_time, j.end_time, j.content_id,
             c.content, c.count
      FROM journals j
      LEFT JOIN contents c ON j.content_id = c.id
      WHERE j.type = 'yearly' AND j.start_time = ? AND j.end_time = ?
    `);
    const journal = stmt.get(startTime, endTime);

    if (!journal) {
      return null;
    }
    return this.parseJournal(journal);
  }
}
