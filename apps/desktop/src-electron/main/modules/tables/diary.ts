import { basename } from "node:path";
import { normalizeDiaryDay } from "@/utils/diary-day";
import { fallbackCommandContext, type CommandContext } from "@tau/rpc";
import Database from "better-sqlite3";
import type { Descendant } from "slate";
import Operation from "./operation";
import ContentTable from "./content";
import { contentSession } from "../collaboration/content-sessions";
import { getContentLength } from "@/utils/helper.ts";
import { getMarkdown } from "@/utils/markdown.ts";
import log from "electron-log";

// weather/mood 反序列化后的结构（与前端 WeatherMood 对齐）
interface WeatherMoodValue {
  type: "emoji" | "image";
  value: string;
}

// diary_entries 表的 DB 行结构
interface RawDiaryEntryRow {
  id: number;
  type: "daily" | "weekly" | "monthly";
  date: string;
  content_id: number | null;
  weather: string | null;
  mood: string | null;
  tags: string | null; // JSON 数组字符串，如 ["日常","反思"]
  word_count: number;
  create_time: number;
  update_time: number;
}

// diary_segments JOIN contents 后的 DB 行结构
interface RawDiarySegmentRow {
  id: number;
  diary_id: number;
  content_id: number;
  content: string | null;
  word_count: number | null;
  tags: string | null; // JSON 数组字符串，如 ["日常","反思"]
  create_time: number;
  update_time: number;
}

// 产品设计：标签与具体 segment 绑定——一天可发多条日记（类朋友圈），
// 每条独立打标签。entry 上遗留的 diary_entries.tags 只是旧模型的历史数据，
// 读写标签一律走 diary_segments.tags，不要改回 entry 级（会整天共享标签）。
export interface DiarySegment {
  id: number;
  diaryId: number;
  contentId: number;
  wordCount: number;
  createTime: number;
  updateTime: number;
  content?: Descendant[];
  tags: string; // JSON string: ["日常","反思"]
}

export interface DiaryEntry {
  id: number;
  type: "daily" | "weekly" | "monthly";
  date: string; // YYYY-MM-DD for daily, YYYY-Www for weekly, YYYY-MM for monthly
  contentId: number | null; // Legacy, deprecated: kept for migration compatibility
  weather: string | null; // JSON string: {type: 'emoji', value: '☀️'}
  mood: string | null; // JSON string: {type: 'emoji', value: '😊'}
  tags: string; // JSON string: ["日常","反思"]
  wordCount: number;
  createTime: number;
  updateTime: number;
  segments: DiarySegment[];
  content?: Descendant[]; // Concatenation of all segments' content (for markdown export etc.)
}

// 朋友圈流用的扁平 segment 项：一个 segment + 父 entry 摘要
export interface DiarySegmentItem {
  id: number;
  diaryId: number;
  contentId: number;
  wordCount: number;
  createTime: number;
  updateTime: number;
  content?: Descendant[];
  entryDate: string;
  entryDateMs: number;
  weather: string | null;
  mood: string | null;
  tags: string; // JSON string
}

// 标签设置
export interface DiaryTagSetting {
  name: string;
  color: string;
  sort: number;
  createTime: number;
  updateTime: number;
}

// createDiaryEntry 的入参：兼容旧 content 单段 + 新 segments 多段
interface CreateDiaryEntryPayload {
  type: "daily" | "weekly" | "monthly";
  date: string;
  weather: string | null;
  mood: string | null;
  tags?: string | null; // JSON string
  content?: Descendant[];
  segments?: Descendant[][];
}

export default class DiaryTable {
  private static parseEntryDateMs(date: string, fallback: number) {
    const parsed = Date.parse(`${date}T00:00:00`);
    return Number.isNaN(parsed) ? fallback : parsed;
  }

  private static getEntrySortTime(
    type: "daily" | "weekly" | "monthly" | null,
    date: string,
    fallback: number
  ) {
    if (type !== "daily") return fallback;
    return this.parseEntryDateMs(date, fallback);
  }

  /** 日记只有按天的碎片；旧 weekly / monthly 条目按归属日显示，「周记」「月记」只是标签 */
  static getDiarySearchTitle(entry: Pick<DiaryEntry, "date" | "createTime">) {
    return `${normalizeDiaryDay(entry.date, entry.createTime)} 日记`;
  }

  /**
   * 写命令包一层：成功后广播 diary:changed 通知其它窗口（渲染端据此失效 ["diary"] 查询，
   * 见 features/diary/queries.ts；flashcards:changed 同款）。派发层把 CommandContext
   * 追加在实参末尾，故取最后一个参数；直接调用（测试 / 内部复用）时没有 ctx 则不广播。
   */
  private static broadcasting<A extends unknown[], R>(
    fn: (db: Database.Database, ...args: A) => R
  ): (db: Database.Database, ...args: A) => R {
    return (db, ...args) => {
      const result = fn(db, ...args);
      const ctx = args[args.length - 1] as Partial<CommandContext> | undefined;
      if (ctx && typeof ctx.broadcastOthers === "function")
        ctx.broadcastOthers("diary:changed", { databaseName: basename(db.name) });
      return result;
    };
  }

  static getListenEvents() {
    const write = <A extends unknown[], R>(fn: (db: Database.Database, ...args: A) => R) =>
      this.broadcasting(fn.bind(this));
    return {
      "create-diary-entry": write(this.createDiaryEntry),
      "update-diary-entry": write(this.updateDiaryEntry),
      "delete-diary-entry": write(this.deleteDiaryEntry),
      "get-diary-entry-by-id": this.getDiaryEntryById.bind(this),
      "get-diary-entry-by-date": this.getDiaryEntryByDate.bind(this),
      "get-diary-entries-by-type": this.getDiaryEntriesByType.bind(this),
      "get-diary-entries-by-date-range": this.getDiaryEntriesByDateRange.bind(this),
      "get-all-diary-entries": this.getAllDiaryEntries.bind(this),
      "get-diary-heatmap-data": this.getDiaryHeatmapData.bind(this),
      "get-diaries-by-dates": this.getDiariesByDates.bind(this),
      "get-diaries-with-content": this.getDiariesWithContent.bind(this),
      // Segment-level CRUD
      "get-diary-segments": this.getDiarySegments.bind(this),
      "create-diary-segment": write(this.createDiarySegment),
      "update-diary-segment": write(this.updateDiarySegment),
      "delete-diary-segment": write(this.deleteDiarySegment),
      // 碎碎念一步发布：确保当天 entry + 建段 + 段级标签（D-044）
      "create-diary-moment": write(this.createDiaryMoment),
      // 朋友圈流 + 标签设置
      "get-all-diary-segments-flat": this.getAllDiarySegmentsFlat.bind(this),
      "get-all-diary-tag-settings": this.getAllDiaryTagSettings.bind(this),
      "upsert-diary-tag-setting": write(this.upsertDiaryTagSetting),
      "delete-diary-tag-setting": write(this.deleteDiaryTagSetting),
    };
  }

  // ---- Segment 解析与查询 ----

  static parseDiarySegment(row: RawDiarySegmentRow): DiarySegment {
    let content: Descendant[] = [];
    if (row.content) {
      try {
        content = JSON.parse(row.content);
      } catch (e) {
        log.error("Error parsing segment content:", e);
      }
    }
    return {
      id: row.id,
      diaryId: row.diary_id,
      contentId: row.content_id,
      wordCount: row.word_count || 0,
      createTime: row.create_time,
      updateTime: row.update_time,
      content,
      tags: row.tags ?? "[]",
    };
  }

  // 查询某篇 diary 的所有 segments（按创建时间升序，JOIN contents 取 content）
  static getDiarySegmentsByDiaryId(db: Database.Database, diaryId: number): DiarySegment[] {
    const stmt = db.prepare(`
      SELECT s.*, c.content, c.count as word_count
      FROM diary_segments s
      LEFT JOIN contents c ON s.content_id = c.id
      WHERE s.diary_id = ?
      ORDER BY s.create_time ASC, s.id ASC
    `);
    const rows = stmt.all(diaryId) as RawDiarySegmentRow[];
    return rows.map(row => this.parseDiarySegment(row));
  }

  private static getDiarySegmentsByDiaryIds(
    db: Database.Database,
    diaryIds: number[]
  ): Map<number, DiarySegment[]> {
    const segmentsByDiaryId = new Map<number, DiarySegment[]>();
    if (diaryIds.length === 0) return segmentsByDiaryId;

    const placeholders = diaryIds.map(() => "?").join(",");
    const stmt = db.prepare(`
      SELECT s.*, c.content, c.count as word_count
      FROM diary_segments s
      LEFT JOIN contents c ON s.content_id = c.id
      WHERE s.diary_id IN (${placeholders})
      ORDER BY s.diary_id ASC, s.create_time ASC, s.id ASC
    `);
    const rows = stmt.all(...diaryIds) as RawDiarySegmentRow[];

    for (const row of rows) {
      const segment = this.parseDiarySegment(row);
      const segments = segmentsByDiaryId.get(segment.diaryId);
      if (segments) {
        segments.push(segment);
      } else {
        segmentsByDiaryId.set(segment.diaryId, [segment]);
      }
    }

    return segmentsByDiaryId;
  }
  // 拼接所有 segment 的 content 为一个完整文档（用于 markdown 导出等只读场景）
  static concatSegmentsContent(segments: DiarySegment[]): Descendant[] {
    const result: Descendant[] = [];
    for (const segment of segments) {
      if (segment.content && segment.content.length > 0) {
        result.push(...segment.content);
      }
    }
    return result;
  }

  // 汇总所有 segment 的字数
  static sumSegmentsWordCount(segments: DiarySegment[]): number {
    return segments.reduce((sum, s) => sum + (s.wordCount || 0), 0);
  }

  static parseDiaryEntry(entry: RawDiaryEntryRow, segments?: DiarySegment[]): DiaryEntry {
    return {
      id: entry.id,
      type: entry.type,
      date: entry.date,
      contentId: entry.content_id ?? null,
      weather: entry.weather,
      mood: entry.mood,
      tags: entry.tags ?? "[]",
      wordCount: entry.word_count || 0,
      createTime: entry.create_time,
      updateTime: entry.update_time,
      segments: segments ?? [],
      content: segments ? this.concatSegmentsContent(segments) : [],
    };
  }

  // 给 diary 行装载 segments，返回完整 DiaryEntry
  private static loadEntryWithSegments(
    db: Database.Database,
    entry: RawDiaryEntryRow | undefined
  ): DiaryEntry {
    const segments = entry ? this.getDiarySegmentsByDiaryId(db, entry.id) : [];
    return this.parseDiaryEntry(entry as RawDiaryEntryRow, segments);
  }

  private static loadEntriesWithSegments(
    db: Database.Database,
    entries: RawDiaryEntryRow[]
  ): DiaryEntry[] {
    const segmentsByDiaryId = this.getDiarySegmentsByDiaryIds(
      db,
      entries.map(entry => entry.id)
    );

    return entries.map(entry => this.parseDiaryEntry(entry, segmentsByDiaryId.get(entry.id) ?? []));
  }
  // ---- Diary CRUD ----

  static createDiaryEntry(db: Database.Database, entry: CreateDiaryEntryPayload): DiaryEntry {
    const now = Date.now();

    // 新建 diary_entries 行（content_id 不再使用，置 null）
    const stmt = db.prepare(`
      INSERT INTO diary_entries (type, date, content_id, weather, mood, tags, word_count, create_time, update_time)
      VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)
    `);

    // 兼容：若调用方传了 content（旧接口），作为单段处理；若传了 segments，按段建
    const segmentsContent: Descendant[][] = entry.segments ? entry.segments : [entry.content ?? []];

    const totalWordCount = segmentsContent.reduce((sum, c) => sum + getContentLength(c || []), 0);

    const res = stmt.run(
      entry.type,
      entry.date,
      entry.weather,
      entry.mood,
      entry.tags ?? "[]",
      totalWordCount,
      now,
      now
    );

    const diaryId = Number(res.lastInsertRowid);

    // 为每段建 content + segment 行
    const insertSegment = db.prepare(`
      INSERT INTO diary_segments (diary_id, content_id, create_time, update_time)
      VALUES (?, ?, ?, ?)
    `);
    segmentsContent.forEach(segContent => {
      const contentId = ContentTable.createContent(db, {
        content: segContent || [],
        count: getContentLength(segContent || []),
      });
      insertSegment.run(diaryId, contentId, now, now);
    });

    Operation.insertOperation(db, "diary-entry", "insert", diaryId, now);

    return this.getDiaryEntryById(db, diaryId);
  }

  static updateDiaryEntry(
    db: Database.Database,
    entry: Partial<DiaryEntry> & { id: number },
    ctx: CommandContext = fallbackCommandContext
  ): DiaryEntry {
    const now = Date.now();
    const existingEntry = this.getDiaryEntryById(db, entry.id);

    if (!existingEntry) {
      throw new Error(`Diary entry with id ${entry.id} not found`);
    }

    // 兼容旧调用方：整体 content 更新只覆盖首个 segment，不再隐式拆分多段。
    if (entry.content !== undefined) {
      this.updateFirstSegmentContent(db, entry.id, entry.content, ctx);
    }

    // weather/mood/tags 更新
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

    if (entry.tags !== undefined) {
      updateFields.push("tags = ?");
      updateValues.push(entry.tags);
    }

    updateFields.push("update_time = ?");
    updateValues.push(now);
    updateValues.push(entry.id);

    db.prepare(`UPDATE diary_entries SET ${updateFields.join(", ")} WHERE id = ?`).run(
      ...updateValues
    );

    if (entry.content !== undefined) {
      this.syncDiaryWordCount(db, entry.id);
    }

    Operation.insertOperation(db, "diary-entry", "update", entry.id, now);

    return this.getDiaryEntryById(db, entry.id);
  }

  private static updateFirstSegmentContent(
    db: Database.Database,
    diaryId: number,
    content: Descendant[],
    ctx: CommandContext = fallbackCommandContext
  ) {
    const [firstSegment] = this.getDiarySegmentsByDiaryId(db, diaryId);
    const now = Date.now();
    if (firstSegment) {
      ContentTable.updateContent(
        db,
        firstSegment.contentId,
        {
          content,
          count: getContentLength(content),
        },
        ctx
      );
      db.prepare(`UPDATE diary_segments SET update_time = ? WHERE id = ?`).run(
        now,
        firstSegment.id
      );
      return;
    }

    const contentId = ContentTable.createContent(db, {
      content,
      count: getContentLength(content),
    });
    db.prepare(
      `INSERT INTO diary_segments (diary_id, content_id, create_time, update_time) VALUES (?, ?, ?, ?)`
    ).run(diaryId, contentId, now, now);
  }

  static deleteDiaryEntry(db: Database.Database, id: number): number {
    const entry = this.getDiaryEntryById(db, id);

    // 先删 segment 行解除外键，再递减对应 content 引用计数
    if (entry) {
      for (const segment of entry.segments) {
        this.deleteSegmentInternal(db, segment.id);
      }
    }

    const stmt = db.prepare("DELETE FROM diary_entries WHERE id = ?");
    Operation.insertOperation(db, "diary-entry", "delete", id, Date.now());
    return stmt.run(id).changes;
  }

  static getDiaryEntryById(db: Database.Database, id: number): DiaryEntry {
    const stmt = db.prepare(`
      SELECT d.* FROM diary_entries d WHERE d.id = ?
    `);
    const entry = stmt.get(id) as RawDiaryEntryRow | undefined;
    return this.loadEntryWithSegments(db, entry);
  }

  static getDiaryEntryByIdOrNull(db: Database.Database, id: number): DiaryEntry | null {
    const stmt = db.prepare(`
      SELECT d.* FROM diary_entries d WHERE d.id = ?
    `);
    const entry = stmt.get(id) as RawDiaryEntryRow | undefined;
    if (!entry) return null;
    return this.loadEntryWithSegments(db, entry);
  }

  static getDiaryEntryByDate(db: Database.Database, date: string): DiaryEntry | null {
    const stmt = db.prepare(`
      SELECT d.* FROM diary_entries d WHERE d.date = ?
    `);
    const entry = stmt.get(date) as RawDiaryEntryRow | undefined;
    if (!entry) return null;
    return this.loadEntryWithSegments(db, entry);
  }

  static getDiaryEntriesByType(
    db: Database.Database,
    type: "daily" | "weekly" | "monthly"
  ): DiaryEntry[] {
    const stmt = db.prepare(`
      SELECT d.* FROM diary_entries d
      WHERE d.type = ?
      ORDER BY d.date DESC
    `);
    const entries = stmt.all(type) as RawDiaryEntryRow[];
    return this.loadEntriesWithSegments(db, entries);
  }

  static getDiaryEntriesByDateRange(
    db: Database.Database,
    startDate: string,
    endDate: string,
    diaryType?: "daily" | "weekly" | "monthly"
  ): DiaryEntry[] {
    let query = `
      SELECT d.* FROM diary_entries d
      WHERE d.date >= ? AND d.date <= ?
    `;
    const params: any[] = [startDate, endDate];

    if (diaryType) {
      query += ` AND d.type = ?`;
      params.push(diaryType);
    }

    query += ` ORDER BY d.date DESC`;

    const stmt = db.prepare(query);
    const entries = stmt.all(...params) as RawDiaryEntryRow[];
    return this.loadEntriesWithSegments(db, entries);
  }

  static getAllDiaryEntries(db: Database.Database): DiaryEntry[] {
    const stmt = db.prepare(`
      SELECT d.* FROM diary_entries d
      ORDER BY d.date DESC
    `);
    const entries = stmt.all() as RawDiaryEntryRow[];
    return this.loadEntriesWithSegments(db, entries);
  }

  static getDiaryHeatmapData(
    db: Database.Database,
    year: number,
    month: number
  ): Array<{ date: string; wordCount: number }> {
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate =
      month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;

    // 汇总各 segment 的字数（contents.count）按 diary 聚合
    const stmt = db.prepare(`
      SELECT d.date, COALESCE(SUM(c.count), 0) as wordCount
      FROM diary_entries d
      LEFT JOIN diary_segments s ON s.diary_id = d.id
      LEFT JOIN contents c ON s.content_id = c.id
      WHERE d.type = 'daily' AND d.date >= ? AND d.date < ?
      GROUP BY d.id, d.date
      ORDER BY d.date
    `);

    return stmt.all(startDate, endDate) as Array<{
      date: string;
      wordCount: number;
    }>;
  }

  static getDiariesByDates(
    db: Database.Database,
    dates: string[],
    diaryType?: "daily" | "weekly" | "monthly"
  ): DiaryEntry[] {
    if (dates.length === 0) return [];

    const placeholders = dates.map(() => "?").join(",");
    let sql = `
      SELECT de.* FROM diary_entries de
      WHERE de.date IN (${placeholders})
    `;

    const params: any[] = [...dates];

    if (diaryType) {
      sql += ` AND de.type = ?`;
      params.push(diaryType);
    }

    sql += ` ORDER BY de.date DESC`;

    const stmt = db.prepare(sql);
    const entries = stmt.all(...params) as RawDiaryEntryRow[];

    return this.loadEntriesWithSegments(db, entries);
  }

  static getDiariesWithContent(
    db: Database.Database,
    params: {
      dates?: string[];
      startDate?: string;
      endDate?: string;
      diaryType?: "daily" | "weekly" | "monthly";
      maxLength?: number;
    }
  ): Array<{
    id: number;
    type: "daily" | "weekly" | "monthly";
    date: string;
    weather: WeatherMoodValue | null;
    mood: WeatherMoodValue | null;
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
        params.diaryType
      );
    } else {
      return [];
    }

    return entries.map(entry => {
      const fullContent = this.concatSegmentsContent(entry.segments);
      let markdown = fullContent.length > 0 ? getMarkdown(fullContent) : "";
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
        weather: entry.weather ? (JSON.parse(entry.weather) as WeatherMoodValue) : null,
        mood: entry.mood ? (JSON.parse(entry.mood) as WeatherMoodValue) : null,
        wordCount: entry.wordCount,
        content: markdown,
        createTime: formatTime(entry.createTime),
        updateTime: formatTime(entry.updateTime),
      };
    });
  }

  // ---- Segment-level CRUD（IPC 暴露） ----

  static getDiarySegments(db: Database.Database, diaryId: number): DiarySegment[] {
    return this.getDiarySegmentsByDiaryId(db, diaryId);
  }

  static createDiarySegment(
    db: Database.Database,
    params: { diaryId: number; content: Descendant[] }
  ): DiarySegment {
    const { diaryId, content } = params;
    const now = Date.now();
    const contentId = ContentTable.createContent(db, {
      content: content || [],
      count: getContentLength(content || []),
    });

    const res = db
      .prepare(
        `INSERT INTO diary_segments (diary_id, content_id, create_time, update_time) VALUES (?, ?, ?, ?)`
      )
      .run(diaryId, contentId, now, now);

    // 同步 diary_entries.word_count
    this.syncDiaryWordCount(db, diaryId);
    // bump update_time，让 FTS/vec reconcile 队列检测到内容变更
    db.prepare(`UPDATE diary_entries SET update_time = ? WHERE id = ?`).run(now, diaryId);
    Operation.insertOperation(db, "diary-entry", "update", diaryId, now);

    const created = this.getDiarySegmentById(db, Number(res.lastInsertRowid));
    if (!created) {
      throw new Error(`Failed to load created diary segment ${res.lastInsertRowid}`);
    }
    return created;
  }

  /**
   * 碎碎念一步发布（D-044）：单事务内确保 date 当天的 daily entry 存在 → 建段 → 写段级标签，
   * 替代渲染端「建 entry / 建段 / 再改标签」三次往返。标签去空去重，与 updateDiarySegment 同口径。
   */
  static createDiaryMoment(
    db: Database.Database,
    params: { date: string; content: Descendant[]; tags?: string[] }
  ): DiarySegmentItem {
    const run = db.transaction(() => {
      const existing = db
        .prepare(
          `SELECT id FROM diary_entries WHERE type = 'daily' AND date = ? ORDER BY id LIMIT 1`
        )
        .get(params.date) as { id: number } | undefined;
      const diaryId =
        existing?.id ??
        this.createDiaryEntry(db, {
          type: "daily",
          date: params.date,
          weather: null,
          mood: null,
          tags: "[]",
          segments: [],
        }).id;
      const segment = this.createDiarySegment(db, { diaryId, content: params.content });
      const tags = [...new Set((params.tags ?? []).map(tag => tag.trim()).filter(Boolean))];
      if (tags.length)
        db.prepare(`UPDATE diary_segments SET tags = ? WHERE id = ?`).run(
          JSON.stringify(tags),
          segment.id
        );
      return segment.id;
    });
    const segmentId = run();
    const [item] = this.querySegmentsFlat(db, "WHERE s.id = ?", [segmentId]);
    if (!item) throw new Error(`Failed to load created diary moment ${segmentId}`);
    return item;
  }

  static updateDiarySegment(
    db: Database.Database,
    params: { segmentId: number; content?: Descendant[]; tags?: string[] },
    ctx: CommandContext = fallbackCommandContext
  ): DiarySegment | null {
    const { segmentId, content, tags } = params;
    const seg = this.getDiarySegmentById(db, segmentId);
    if (!seg) return null;

    // 内容挂协作会话时由会话负责写入（经投影落库），这里只维护 segment 元数据
    if (content !== undefined && !contentSession(db, seg.contentId)) {
      ContentTable.updateContent(
        db,
        seg.contentId,
        {
          content,
          count: getContentLength(content),
        },
        ctx
      );
    }

    const now = Date.now();
    // 标签与片段绑定：tags 传入时整体覆盖该 segment 的标签（normalize：去空/去重）
    if (tags !== undefined) {
      const normalized = [...new Set(tags.map(tag => tag.trim()).filter(Boolean))];
      db.prepare(`UPDATE diary_segments SET tags = ? WHERE id = ?`).run(
        JSON.stringify(normalized),
        segmentId
      );
    }
    db.prepare(`UPDATE diary_segments SET update_time = ? WHERE id = ?`).run(now, segmentId);
    db.prepare(`UPDATE diary_entries SET update_time = ? WHERE id = ?`).run(now, seg.diaryId);

    if (content !== undefined) {
      this.syncDiaryWordCount(db, seg.diaryId);
    }
    Operation.insertOperation(db, "diary-entry", "update", seg.diaryId, now);

    return this.getDiarySegmentById(db, segmentId);
  }

  static deleteDiarySegment(db: Database.Database, segmentId: number): number {
    const seg = this.getDiarySegmentById(db, segmentId);
    if (!seg) return 0;

    const now = Date.now();
    this.deleteSegmentInternal(db, segmentId);
    this.syncDiaryWordCount(db, seg.diaryId);
    // bump update_time，让 FTS/vec reconcile 队列检测到内容变更
    db.prepare(`UPDATE diary_entries SET update_time = ? WHERE id = ?`).run(now, seg.diaryId);

    Operation.insertOperation(db, "diary-entry", "update", seg.diaryId, now);
    return 1;
  }

  // ---- Segment 内部工具 ----

  private static getDiarySegmentById(
    db: Database.Database,
    segmentId: number
  ): DiarySegment | null {
    const stmt = db.prepare(`
      SELECT s.*, c.content, c.count as word_count
      FROM diary_segments s
      LEFT JOIN contents c ON s.content_id = c.id
      WHERE s.id = ?
    `);
    const row = stmt.get(segmentId) as RawDiarySegmentRow | undefined;
    return row ? this.parseDiarySegment(row) : null;
  }

  private static deleteSegmentInternal(db: Database.Database, segmentId: number) {
    const seg = this.getDiarySegmentById(db, segmentId);
    if (!seg) return;
    // 先解除 diary_entries 旧 content_id 和 diary_segments 对 contents 的外键约束
    db.prepare(`UPDATE diary_entries SET content_id = NULL WHERE id = ? AND content_id = ?`).run(
      seg.diaryId,
      seg.contentId
    );
    db.prepare(`DELETE FROM diary_segments WHERE id = ?`).run(segmentId);
    if (seg.contentId) {
      ContentTable.deleteContent(db, seg.contentId);
    }
  }

  private static syncDiaryWordCount(db: Database.Database, diaryId: number) {
    const result = db
      .prepare(
        `SELECT COALESCE(SUM(c.count), 0) as total
         FROM diary_segments s
         LEFT JOIN contents c ON s.content_id = c.id
         WHERE s.diary_id = ?`
      )
      .get(diaryId) as { total: number };
    db.prepare(`UPDATE diary_entries SET word_count = ? WHERE id = ?`).run(result.total, diaryId);
  }

  // ---- 朋友圈流：扁平 segment + 标签设置 ----

  // 扁平化返回所有 segment（带父 entry 摘要），按日记归属日期降序
  // 标签取 s.tags（与片段绑定），不再从父 entry 借
  static getAllDiarySegmentsFlat(db: Database.Database): DiarySegmentItem[] {
    return this.querySegmentsFlat(db, "", []);
  }

  private static querySegmentsFlat(
    db: Database.Database,
    where: string,
    params: unknown[]
  ): DiarySegmentItem[] {
    const stmt = db.prepare(`
      SELECT s.id, s.diary_id, s.content_id, s.create_time, s.update_time,
             c.content, c.count as word_count, s.tags,
             d.type as entry_type, d.date as entry_date, d.weather, d.mood
      FROM diary_segments s
      LEFT JOIN contents c ON s.content_id = c.id
      LEFT JOIN diary_entries d ON s.diary_id = d.id
      ${where}
      ORDER BY
        CASE
          WHEN d.type = 'daily' AND d.date GLOB '????-??-??' THEN strftime('%s', d.date) * 1000
          ELSE s.create_time
        END DESC,
        s.create_time DESC,
        s.id DESC
    `);
    const rows = stmt.all(...params) as Array<{
      id: number;
      diary_id: number;
      content_id: number;
      create_time: number;
      update_time: number;
      content: string | null;
      word_count: number | null;
      entry_type: "daily" | "weekly" | "monthly" | null;
      entry_date: string | null;
      weather: string | null;
      mood: string | null;
      tags: string | null;
    }>;

    return rows.map(row => {
      let content: Descendant[] = [];
      if (row.content) {
        try {
          content = JSON.parse(row.content);
        } catch (e) {
          log.error("Error parsing flat segment content:", e);
        }
      }
      return {
        id: row.id,
        diaryId: row.diary_id,
        contentId: row.content_id,
        wordCount: row.word_count || 0,
        createTime: row.create_time,
        updateTime: row.update_time,
        content,
        entryDate: row.entry_date ?? "",
        entryDateMs: this.getEntrySortTime(row.entry_type, row.entry_date ?? "", row.create_time),
        weather: row.weather,
        mood: row.mood,
        tags: row.tags ?? "[]",
      };
    });
  }

  // ---- 标签设置 CRUD ----

  static getAllDiaryTagSettings(db: Database.Database): DiaryTagSetting[] {
    const stmt = db.prepare(`
      SELECT name, color, sort, create_time, update_time
      FROM diary_tag_settings
      ORDER BY sort ASC, create_time ASC
    `);
    const rows = stmt.all() as Array<{
      name: string;
      color: string;
      sort: number;
      create_time: number;
      update_time: number;
    }>;
    return rows.map(row => ({
      name: row.name,
      color: row.color,
      sort: row.sort,
      createTime: row.create_time,
      updateTime: row.update_time,
    }));
  }

  static upsertDiaryTagSetting(
    db: Database.Database,
    setting: { name: string; color: string; sort?: number }
  ): DiaryTagSetting {
    const now = Date.now();
    db.prepare(
      `
      INSERT INTO diary_tag_settings (name, color, sort, create_time, update_time)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET color = excluded.color, sort = excluded.sort, update_time = excluded.update_time
    `
    ).run(setting.name, setting.color, setting.sort ?? 0, now, now);

    const row = db.prepare(`SELECT * FROM diary_tag_settings WHERE name = ?`).get(setting.name) as {
      name: string;
      color: string;
      sort: number;
      create_time: number;
      update_time: number;
    };
    return {
      name: row.name,
      color: row.color,
      sort: row.sort,
      createTime: row.create_time,
      updateTime: row.update_time,
    };
  }

  static deleteDiaryTagSetting(db: Database.Database, name: string): number {
    // 标签库是唯一数据源：删除时事务级联摘除所有片段上的该标签。
    // 逐行解析 JSON 而非模糊 SQL 匹配：标签名可含引号、百分号等特殊字符。
    const removeTag = db.transaction(() => {
      const deleted = db.prepare(`DELETE FROM diary_tag_settings WHERE name = ?`).run(name).changes;
      const rows = db.prepare(`SELECT id, tags FROM diary_segments`).all() as Array<{
        id: number;
        tags: string | null;
      }>;
      for (const row of rows) {
        let tags: string[];
        try {
          tags = JSON.parse(row.tags ?? "[]");
        } catch {
          continue;
        }
        if (!tags.includes(name)) continue;
        const next = tags.filter(tag => tag !== name);
        db.prepare(`UPDATE diary_segments SET tags = ? WHERE id = ?`).run(
          JSON.stringify(next),
          row.id
        );
      }
      return deleted;
    });
    return removeTag();
  }
}
