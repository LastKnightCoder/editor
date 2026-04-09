import Database from "better-sqlite3";
import Operation from "./operation";
import ContentTable from "./content";
import { getContentLength } from "@/utils/helper.ts";
import { getMarkdown } from "@/utils/markdown.ts";
import log from "electron-log";
import { BrowserWindow } from "electron";

export interface DiaryEntry {
  id: number;
  type: "daily" | "weekly" | "monthly";
  date: string; // YYYY-MM-DD for daily, YYYY-Www for weekly, YYYY-MM for monthly
  contentId: number;
  weather: string | null; // JSON string: {type: 'emoji', value: '☀️'}
  mood: string | null; // JSON string: {type: 'emoji', value: '😊'}
  wordCount: number;
  createTime: number;
  updateTime: number;
  content?: any[]; // Loaded from content table
}

export default class DiaryTable {
  static upgradeTable(db: Database.Database) {
    // Check if we need to migrate from daily_notes table
    const tableExists = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='daily_notes'`,
      )
      .get();

    if (tableExists) {
      log.info("Migrating data from daily_notes to diary_entries...");

      try {
        // Check if migration has already been done
        const existingEntries = db
          .prepare(
            `SELECT COUNT(*) as count FROM diary_entries WHERE type='daily'`,
          )
          .get() as { count: number };

        const oldNotes = db
          .prepare(`SELECT COUNT(*) as count FROM daily_notes`)
          .get() as { count: number };

        if (existingEntries.count === 0 && oldNotes.count > 0) {
          // Migrate data
          const notes = db
            .prepare(`SELECT id, date, content_id FROM daily_notes ORDER BY id`)
            .all();

          const insertStmt = db.prepare(`
            INSERT INTO diary_entries (type, date, content_id, weather, mood, word_count, create_time, update_time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `);

          const now = Date.now();

          for (const note of notes as any[]) {
            // Get content to calculate word count
            let wordCount = 0;
            if (note.content_id) {
              const content = db
                .prepare(`SELECT content FROM contents WHERE id = ?`)
                .get(note.content_id) as { content: string } | undefined;

              if (content && content.content) {
                try {
                  const contentArray = JSON.parse(content.content);
                  wordCount = getContentLength(contentArray);
                } catch (e) {
                  log.error("Error parsing content for word count:", e);
                }
              }
            }

            insertStmt.run(
              "daily",
              note.date,
              note.content_id,
              null, // weather
              null, // mood
              wordCount,
              now,
              now,
            );
          }

          log.info(
            `Successfully migrated ${notes.length} entries from daily_notes to diary_entries`,
          );
        } else {
          log.info("Migration already completed or no data to migrate");
        }
      } catch (error) {
        log.error("Error during migration:", error);
      }
    }
  }

  static getListenEvents() {
    return {
      "create-diary-entry": this.createDiaryEntry.bind(this),
      "update-diary-entry": this.updateDiaryEntry.bind(this),
      "delete-diary-entry": this.deleteDiaryEntry.bind(this),
      "get-diary-entry-by-id": this.getDiaryEntryById.bind(this),
      "get-diary-entry-by-date": this.getDiaryEntryByDate.bind(this),
      "get-diary-entries-by-type": this.getDiaryEntriesByType.bind(this),
      "get-diary-entries-by-date-range":
        this.getDiaryEntriesByDateRange.bind(this),
      "get-all-diary-entries": this.getAllDiaryEntries.bind(this),
      "get-diary-heatmap-data": this.getDiaryHeatmapData.bind(this),
      "get-diaries-by-dates": this.getDiariesByDates.bind(this),
      "get-diaries-with-content": this.getDiariesWithContent.bind(this),
    };
  }

  static parseDiaryEntry(entry: any): DiaryEntry {
    let content = [];

    if (entry.content) {
      try {
        content = JSON.parse(entry.content);
      } catch (error) {
        log.error("Error parsing content:", error);
      }
    }

    return {
      id: entry.id,
      type: entry.type,
      date: entry.date,
      contentId: entry.content_id,
      weather: entry.weather,
      mood: entry.mood,
      wordCount: entry.word_count || 0,
      createTime: entry.create_time,
      updateTime: entry.update_time,
      content: content,
    };
  }

  static createDiaryEntry(
    db: Database.Database,
    entry: Omit<DiaryEntry, "id" | "createTime" | "updateTime">,
  ): DiaryEntry {
    const now = Date.now();

    // Create content record
    const contentId = ContentTable.createContent(db, {
      content: entry.content || [],
      count: getContentLength(entry.content || []),
    });

    // Create diary entry
    const stmt = db.prepare(`
      INSERT INTO diary_entries (type, date, content_id, weather, mood, word_count, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const wordCount = getContentLength(entry.content || []);

    const res = stmt.run(
      entry.type,
      entry.date,
      contentId,
      entry.weather,
      entry.mood,
      wordCount,
      now,
      now,
    );

    Operation.insertOperation(
      db,
      "diary-entry",
      "insert",
      res.lastInsertRowid,
      now,
    );

    return this.getDiaryEntryById(db, Number(res.lastInsertRowid));
  }

  static updateDiaryEntry(
    db: Database.Database,
    entry: Partial<DiaryEntry> & { id: number },
    win: BrowserWindow,
  ): DiaryEntry {
    const now = Date.now();
    const existingEntry = this.getDiaryEntryById(db, entry.id);

    if (!existingEntry) {
      throw new Error(`Diary entry with id ${entry.id} not found`);
    }

    // Update content if provided
    if (entry.content !== undefined && existingEntry.contentId) {
      const wordCount = getContentLength(entry.content);

      ContentTable.updateContent(
        db,
        existingEntry.contentId,
        {
          content: entry.content,
          count: wordCount,
        },
        win,
      );

      // Update word_count in diary_entries
      db.prepare(`UPDATE diary_entries SET word_count = ? WHERE id = ?`).run(
        wordCount,
        entry.id,
      );
    }

    // Update other fields
    const updateFields: string[] = [];
    const updateValues: any[] = [];

    if (entry.weather !== undefined) {
      updateFields.push("weather = ?");
      updateValues.push(entry.weather);
    }

    if (entry.mood !== undefined) {
      updateFields.push("mood = ?");
      updateValues.push(entry.mood);
    }

    if (updateFields.length > 0) {
      updateFields.push("update_time = ?");
      updateValues.push(now);
      updateValues.push(entry.id);

      const updateStmt = db.prepare(
        `UPDATE diary_entries SET ${updateFields.join(", ")} WHERE id = ?`,
      );
      updateStmt.run(...updateValues);
    } else {
      // Always update update_time
      db.prepare(`UPDATE diary_entries SET update_time = ? WHERE id = ?`).run(
        now,
        entry.id,
      );
    }

    Operation.insertOperation(db, "diary-entry", "update", entry.id, now);

    return this.getDiaryEntryById(db, entry.id);
  }

  static deleteDiaryEntry(db: Database.Database, id: number): number {
    const entry = this.getDiaryEntryById(db, id);

    if (entry && entry.contentId) {
      ContentTable.deleteContent(db, entry.contentId);
    }

    const stmt = db.prepare("DELETE FROM diary_entries WHERE id = ?");
    Operation.insertOperation(db, "diary-entry", "delete", id, Date.now());
    return stmt.run(id).changes;
  }

  static getDiaryEntryById(db: Database.Database, id: number): DiaryEntry {
    const stmt = db.prepare(`
      SELECT d.*, c.content
      FROM diary_entries d
      LEFT JOIN contents c ON d.content_id = c.id
      WHERE d.id = ?
    `);
    const entry = stmt.get(id);
    return this.parseDiaryEntry(entry);
  }

  static getDiaryEntryByIdOrNull(
    db: Database.Database,
    id: number,
  ): DiaryEntry | null {
    const stmt = db.prepare(`
      SELECT d.*, c.content
      FROM diary_entries d
      LEFT JOIN contents c ON d.content_id = c.id
      WHERE d.id = ?
    `);
    const entry = stmt.get(id);
    if (!entry) {
      return null;
    }
    return this.parseDiaryEntry(entry);
  }

  static getDiaryEntryByDate(
    db: Database.Database,
    date: string,
  ): DiaryEntry | null {
    const stmt = db.prepare(`
      SELECT d.*, c.content
      FROM diary_entries d
      LEFT JOIN contents c ON d.content_id = c.id
      WHERE d.date = ?
    `);
    const entry = stmt.get(date);
    return entry ? this.parseDiaryEntry(entry) : null;
  }

  static getDiaryEntriesByType(
    db: Database.Database,
    type: "daily" | "weekly" | "monthly",
  ): DiaryEntry[] {
    const stmt = db.prepare(`
      SELECT d.*, c.content
      FROM diary_entries d
      LEFT JOIN contents c ON d.content_id = c.id
      WHERE d.type = ?
      ORDER BY d.date DESC
    `);
    const entries = stmt.all(type);
    return entries.map((entry) => this.parseDiaryEntry(entry));
  }

  static getDiaryEntriesByDateRange(
    db: Database.Database,
    startDate: string,
    endDate: string,
    diaryType?: "daily" | "weekly" | "monthly",
  ): DiaryEntry[] {
    let query = `
      SELECT d.*, c.content
      FROM diary_entries d
      LEFT JOIN contents c ON d.content_id = c.id
      WHERE d.date >= ? AND d.date <= ?
    `;
    const params: any[] = [startDate, endDate];

    if (diaryType) {
      query += ` AND d.type = ?`;
      params.push(diaryType);
    }

    query += ` ORDER BY d.date DESC`;

    const stmt = db.prepare(query);
    const entries = stmt.all(...params);
    return entries.map((entry) => this.parseDiaryEntry(entry));
  }

  static getAllDiaryEntries(db: Database.Database): DiaryEntry[] {
    const stmt = db.prepare(`
      SELECT d.*, c.content
      FROM diary_entries d
      LEFT JOIN contents c ON d.content_id = c.id
      ORDER BY d.date DESC
    `);
    const entries = stmt.all();
    return entries.map((entry) => this.parseDiaryEntry(entry));
  }

  /**
   * Get heatmap data for a specific month
   * Returns word count for each day in the month
   */
  static getDiaryHeatmapData(
    db: Database.Database,
    year: number,
    month: number,
  ): Array<{ date: string; wordCount: number }> {
    // Format: YYYY-MM
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate =
      month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, "0")}-01`;

    const stmt = db.prepare(`
      SELECT date, word_count as wordCount
      FROM diary_entries
      WHERE type = 'daily' AND date >= ? AND date < ?
      ORDER BY date
    `);

    const results = stmt.all(startDate, endDate) as Array<{
      date: string;
      wordCount: number;
    }>;

    return results;
  }

  // 批量日期查询
  static getDiariesByDates(
    db: Database.Database,
    dates: string[],
    diaryType?: "daily" | "weekly" | "monthly",
  ): DiaryEntry[] {
    if (dates.length === 0) return [];

    const placeholders = dates.map(() => "?").join(",");
    let sql = `
      SELECT de.*, ct.content
      FROM diary_entries de
      LEFT JOIN contents ct ON de.content_id = ct.id
      WHERE de.date IN (${placeholders})
    `;

    const params: any[] = [...dates];

    if (diaryType) {
      sql += ` AND de.type = ?`;
      params.push(diaryType);
    }

    sql += ` ORDER BY de.date DESC`;

    const stmt = db.prepare(sql);
    const entries = stmt.all(...params);

    return entries.map((entry) => this.parseDiaryEntry(entry));
  }

  // 获取日记内容（带 Markdown 转换）
  static getDiariesWithContent(
    db: Database.Database,
    params: {
      dates?: string[];
      startDate?: string;
      endDate?: string;
      diaryType?: "daily" | "weekly" | "monthly";
      maxLength?: number;
    },
  ): Array<{
    id: number;
    type: "daily" | "weekly" | "monthly";
    date: string;
    weather: any;
    mood: any;
    wordCount: number;
    content: string;
    createTime: string;
    updateTime: string;
  }> {
    let entries: DiaryEntry[];

    if (params.dates && params.dates.length > 0) {
      entries = this.getDiariesByDates(db, params.dates, params.diaryType);
    } else if (params.startDate && params.endDate) {
      entries = this.getDiaryEntriesByDateRange(
        db,
        params.startDate,
        params.endDate,
        params.diaryType,
      );
    } else {
      return [];
    }

    return entries.map((entry) => {
      let markdown = entry.content ? getMarkdown(entry.content) : "";
      const maxLength = params.maxLength;

      if (maxLength && markdown.length > maxLength) {
        let truncated = markdown.substring(0, maxLength);
        const breakPoints = ["\n\n", "\n", "。", "！", "？", ".", "!", "?"];
        let bestBreak = -1;

        for (const bp of breakPoints) {
          const idx = truncated.lastIndexOf(bp);
          if (idx > maxLength * 0.8) {
            bestBreak = idx + bp.length;
            break;
          }
        }

        if (bestBreak > 0) {
          truncated = truncated.substring(0, bestBreak);
        }

        markdown = truncated + "\n\n[内容已截断...]";
      }

      const formatTime = (timestamp: number) => {
        const d = new Date(timestamp);
        return d.toISOString().replace("T", " ").substring(0, 19);
      };

      return {
        id: entry.id,
        type: entry.type,
        date: entry.date,
        weather: entry.weather ? JSON.parse(entry.weather) : null,
        mood: entry.mood ? JSON.parse(entry.mood) : null,
        wordCount: entry.wordCount,
        content: markdown,
        createTime: formatTime(entry.createTime),
        updateTime: formatTime(entry.updateTime),
      };
    });
  }
}
