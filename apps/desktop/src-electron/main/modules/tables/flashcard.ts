import { basename } from "node:path";
import Database from "better-sqlite3";
import log from "electron-log";
import { fallbackCommandContext, type CommandContext } from "@tau/rpc";
import {
  FlashcardDeck,
  FlashcardDeckStats,
  CreateFlashcardDeckInput,
  UpdateFlashcardDeckInput,
  Flashcard,
  CreateFlashcardInput,
  UpdateFlashcardInput,
  FlashcardReference,
  FlashcardReferenceInput,
  FlashcardReviewPayload,
  FlashcardReviewResult,
  FlashcardUndoReviewPayload,
  FlashcardQueueRequest,
  FlashcardReviewRating,
  FlashcardReviewStats,
} from "@/types";
import ContentTable from "./content";

type DeckRow = {
  id: number;
  name: string;
  description: string;
  cover_color: string;
  emoji: string;
  sort_order: number;
  meta: string | null;
  create_time: number;
  update_time: number;
};

type CardRow = {
  id: number;
  deck_id: number;
  type: string;
  prompt: string;
  detail: string;
  data: string;
  tags: string;
  difficulty: string;
  review_level: number;
  due_time: number;
  last_review_time: number | null;
  review_count: number;
  ease_factor: number;
  status: string;
  reference_summary: string | null;
  create_time: number;
  update_time: number;
};

type ReferenceRow = {
  id: number;
  card_id: number;
  content_id: number;
  ref_type: string;
  title: string;
  create_time: number;
  update_time: number;
};

const REVIEW_INTERVALS = [
  5 * 60 * 1000, // 5分钟
  30 * 60 * 1000, // 30分钟
  12 * 60 * 60 * 1000, // 12小时
  24 * 60 * 60 * 1000, // 1天
  2 * 24 * 60 * 60 * 1000, // 2天
  4 * 24 * 60 * 60 * 1000, // 4天
  7 * 24 * 60 * 60 * 1000, // 1周
  15 * 24 * 60 * 60 * 1000, // 15天
  30 * 24 * 60 * 60 * 1000, // 1个月
  60 * 24 * 60 * 60 * 1000, // 2个月
];

const RATING_DELTA: Record<FlashcardReviewRating, number> = {
  easy: 2,
  normal: 1,
  struggle: -1,
  hard: -2,
};

const EASE_DELTA: Record<FlashcardReviewRating, number> = {
  easy: 0.15,
  normal: 0,
  struggle: -0.1,
  hard: -0.25,
};

const DEFAULT_COLOR = "#2563eb";
const DEFAULT_EMOJI = "🧠";
const EASE_RANGE = { min: 1.3, max: 3.5 };

class FlashcardTable {
  private static readonly reviewIdHighWater = new WeakMap<Database.Database, number>();

  /** 写命令成功后通知其它窗口（渲染端据此失效 ["flashcards"] 查询，见 features/flashcards/queries.ts） */
  private static changed(db: Database.Database, ctx: CommandContext) {
    ctx.broadcastOthers("flashcards:changed", { databaseName: basename(db.name) });
  }

  static getListenEvents() {
    return {
      "flashcard:list-decks": this.listDecks.bind(this),
      "flashcard:get-deck": this.getDeck.bind(this),
      "flashcard:create-deck": this.createDeck.bind(this),
      "flashcard:update-deck": this.updateDeck.bind(this),
      "flashcard:delete-deck": this.deleteDeck.bind(this),
      "flashcard:list-cards": this.listFlashcards.bind(this),
      "flashcard:get-card": this.getFlashcard.bind(this),
      "flashcard:create-card": this.createFlashcard.bind(this),
      "flashcard:update-card": this.updateFlashcard.bind(this),
      "flashcard:delete-card": this.deleteFlashcard.bind(this),
      "flashcard:get-review-queue": this.getReviewQueue.bind(this),
      "flashcard:submit-review": this.submitReview.bind(this),
      "flashcard:undo-review": this.undoReview.bind(this),
      "flashcard:review-stats": this.getReviewStats.bind(this),
    };
  }
  private static parseJSON<T>(value: string | null | undefined, fallback: T): T {
    if (!value) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      log.error("[FlashcardTable] Failed to parse JSON", error);
      return fallback;
    }
  }

  private static mapDeckRow(row: DeckRow, stats?: FlashcardDeckStats): FlashcardDeck {
    return {
      id: row.id,
      name: row.name,
      description: row.description || "",
      coverColor: row.cover_color || DEFAULT_COLOR,
      emoji: row.emoji || DEFAULT_EMOJI,
      sortOrder: row.sort_order ?? 0,
      meta: this.parseJSON<Record<string, unknown> | null>(row.meta, null),
      createTime: row.create_time,
      updateTime: row.update_time,
      stats,
    };
  }

  private static mapReferenceRow(
    row: ReferenceRow,
    content?: {
      id: number;
      content: any;
      createTime: number;
      updateTime: number;
      count: number;
      refCount: number;
    } | null
  ): FlashcardReference {
    return {
      id: row.id,
      cardId: row.card_id,
      contentId: row.content_id,
      refType: row.ref_type as FlashcardReference["refType"],
      title: row.title,
      createTime: row.create_time,
      updateTime: row.update_time,
      content: content || undefined,
    };
  }

  private static mapCardRow(row: CardRow, references: FlashcardReference[]): Flashcard {
    // Parse prompt as Descendant[] with fallback
    let prompt: any;
    try {
      prompt = JSON.parse(row.prompt);
      if (!Array.isArray(prompt)) {
        // Fallback: wrap plain text in Descendant structure
        prompt = [
          {
            type: "paragraph",
            children: [{ type: "formatted", text: row.prompt || "" }],
          },
        ];
      }
    } catch {
      // Fallback: wrap plain text in Descendant structure
      prompt = [
        {
          type: "paragraph",
          children: [{ type: "formatted", text: row.prompt || "" }],
        },
      ];
    }

    // Parse detail as Descendant[] with fallback
    let detail: any;
    try {
      detail = JSON.parse(row.detail);
      if (!Array.isArray(detail)) {
        detail = [
          {
            type: "paragraph",
            children: [{ type: "formatted", text: row.detail || "" }],
          },
        ];
      }
    } catch {
      detail = [
        {
          type: "paragraph",
          children: [{ type: "formatted", text: row.detail || "" }],
        },
      ];
    }

    return {
      id: row.id,
      deckId: row.deck_id,
      type: row.type as Flashcard["type"],
      prompt,
      detail,
      data: this.parseJSON(row.data, {
        options: [],
        blanks: [],
        answer: "",
      }),
      tags: this.parseJSON<string[]>(row.tags, []),
      difficulty: (row.difficulty || "standard") as Flashcard["difficulty"],
      reviewLevel: row.review_level ?? 0,
      dueTime: row.due_time,
      lastReviewTime: row.last_review_time ?? null,
      reviewCount: row.review_count ?? 0,
      easeFactor: row.ease_factor ?? 2.5,
      status: (row.status || "new") as Flashcard["status"],
      referenceSummary: row.reference_summary ?? null,
      references,
      createTime: row.create_time,
      updateTime: row.update_time,
    };
  }

  private static getDeckStatsMap(db: Database.Database): Map<number, FlashcardDeckStats> {
    const now = Date.now();
    const rows = db
      .prepare(
        `
      SELECT
        deck_id,
        COUNT(*) AS total_cards,
        SUM(CASE WHEN review_count = 0 THEN 1 ELSE 0 END) AS new_cards,
        SUM(CASE WHEN due_time <= ? AND status != 'suspended' THEN 1 ELSE 0 END) AS due_cards,
        SUM(CASE WHEN status = 'learning' THEN 1 ELSE 0 END) AS learning_cards,
        MAX(last_review_time) AS last_review_time
      FROM flashcards
      GROUP BY deck_id
    `
      )
      .all(now) as {
      deck_id: number;
      total_cards: number;
      new_cards: number | null;
      due_cards: number | null;
      learning_cards: number | null;
      last_review_time: number | null;
    }[];

    const statsMap = new Map<number, FlashcardDeckStats>();
    rows.forEach(row => {
      statsMap.set(row.deck_id, {
        totalCards: row.total_cards ?? 0,
        newCount: row.new_cards ?? 0,
        dueCount: row.due_cards ?? 0,
        learningCount: row.learning_cards ?? 0,
        lastReviewedTime: row.last_review_time ?? null,
      });
    });
    return statsMap;
  }

  private static getReferencesByCardIds(
    db: Database.Database,
    cardIds: number[]
  ): Record<number, FlashcardReference[]> {
    if (!cardIds.length) return {};
    const placeholders = cardIds.map(() => "?").join(",");

    // LEFT JOIN contents to get full content data
    const rows = db
      .prepare(
        `SELECT
          fr.*,
          c.id as content_db_id,
          c.content as content_data,
          c.create_time as content_create_time,
          c.update_time as content_update_time,
          c.count as content_count,
          c.ref_count as content_ref_count
        FROM flashcard_references fr
        LEFT JOIN contents c ON fr.content_id = c.id
        WHERE fr.card_id IN (${placeholders})`
      )
      .all(...cardIds) as Array<
      ReferenceRow & {
        content_db_id: number | null;
        content_data: string | null;
        content_create_time: number | null;
        content_update_time: number | null;
        content_count: number | null;
        content_ref_count: number | null;
      }
    >;

    return rows.reduce<Record<number, FlashcardReference[]>>((acc, row) => {
      if (!acc[row.card_id]) {
        acc[row.card_id] = [];
      }

      // Parse content if available
      let content = null;
      if (row.content_db_id && row.content_data) {
        try {
          content = {
            id: row.content_db_id,
            content: JSON.parse(row.content_data),
            createTime: row.content_create_time!,
            updateTime: row.content_update_time!,
            count: row.content_count!,
            refCount: row.content_ref_count!,
          };
        } catch (e) {
          log.error("[FlashcardTable] Failed to parse content data", e);
        }
      }

      acc[row.card_id].push(this.mapReferenceRow(row, content));
      return acc;
    }, {});
  }

  private static replaceReferences(
    db: Database.Database,
    cardId: number,
    references?: FlashcardReferenceInput[]
  ): FlashcardReference[] {
    // 旧引用延后释放：先挂上新引用再减旧计数，避免新旧引用同一 content 时被提前回收
    const releaseOldReferences = this.detachReferences(db, [cardId]);
    if (!references || references.length === 0) {
      releaseOldReferences();
      return [];
    }

    const stmt = db.prepare(`
      INSERT INTO flashcard_references (card_id, content_id, ref_type, title, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();

    const inserted = references.map(ref => {
      let contentId: number;

      // 对于 custom 类型：创建新的 content 记录
      if (ref.refType === "custom") {
        if (!ref.customContent) {
          throw new Error("customContent is required for custom reference type");
        }
        const result = ContentTable.createContent(db, {
          content: ref.customContent,
          count: 0,
          refCount: 1,
        });
        contentId = result;
      } else {
        // 对于 content 类型：使用传入的 contentId
        if (!ref.contentId) {
          throw new Error("contentId is required for content reference type");
        }
        contentId = ref.contentId;
        // 增加被引用内容的 refCount
        ContentTable.incrementRefCount(db, contentId);
      }

      const res = stmt.run(cardId, contentId, ref.refType, ref.title, now, now);

      return {
        id: Number(res.lastInsertRowid),
        cardId,
        contentId,
        refType: ref.refType,
        title: ref.title,
        createTime: now,
        updateTime: now,
      };
    });
    releaseOldReferences();
    return inserted;
  }

  /**
   * 删除指定卡片的全部引用行，返回释放其 content 引用计数的回调。
   * 释放走 ContentTable.deleteContent：计数减一，归零时按 contents 回收逻辑级联清理。
   */
  private static detachReferences(db: Database.Database, cardIds: number[]): () => void {
    if (!cardIds.length) return () => {};
    const placeholders = cardIds.map(() => "?").join(",");
    const rows = db
      .prepare(`SELECT content_id FROM flashcard_references WHERE card_id IN (${placeholders})`)
      .all(...cardIds) as { content_id: number }[];
    db.prepare(`DELETE FROM flashcard_references WHERE card_id IN (${placeholders})`).run(
      ...cardIds
    );
    return () => {
      rows.forEach(row => ContentTable.deleteContent(db, row.content_id));
    };
  }

  private static updateReferenceSummary(db: Database.Database, cardId: number) {
    const titles = db
      .prepare(`SELECT title FROM flashcard_references WHERE card_id = ? ORDER BY update_time DESC`)
      .all(cardId) as { title: string }[];
    const summary = titles
      .slice(0, 3)
      .map(item => item.title)
      .join(" · ");
    db.prepare(`UPDATE flashcards SET reference_summary = ? WHERE id = ?`).run(
      summary || null,
      cardId
    );
  }

  static listDecks(db: Database.Database): FlashcardDeck[] {
    const decks = db
      .prepare(`SELECT * FROM flashcard_decks ORDER BY sort_order ASC, update_time DESC`)
      .all() as DeckRow[];
    const statsMap = this.getDeckStatsMap(db);
    return decks.map(deck =>
      this.mapDeckRow(
        deck,
        statsMap.get(deck.id) ?? {
          totalCards: 0,
          dueCount: 0,
          learningCount: 0,
          newCount: 0,
          lastReviewedTime: null,
        }
      )
    );
  }

  /** 统计页聚合：窗口内评分分布（flashcard_reviews GROUP BY rating）+ 未来 7 天（含今日）到期分桶 */
  static getReviewStats(
    db: Database.Database,
    params: { since?: number } = {}
  ): FlashcardReviewStats {
    const since = params.since ?? 0;
    const ratingRows = db
      .prepare(
        `SELECT rating, COUNT(*) AS count FROM flashcard_reviews WHERE review_time >= ? GROUP BY rating`
      )
      .all(since) as { rating: string; count: number }[];
    const ratings: FlashcardReviewStats["ratings"] = {
      easy: 0,
      normal: 0,
      struggle: 0,
      hard: 0,
    };
    let total = 0;
    for (const row of ratingRows) {
      if (row.rating in ratings) {
        ratings[row.rating as keyof typeof ratings] = row.count;
        total += row.count;
      }
    }

    // 到期分桶按本地日历日归属（DST 切换日不用 86400000 整除）
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const start = dayStart.getTime();
    const dueRows = db
      .prepare(`SELECT due_time FROM flashcards WHERE due_time >= ? AND due_time < ?`)
      .all(start, start + 7 * 86_400_000) as { due_time: number }[];
    const dueBuckets = new Array<number>(7).fill(0);
    for (const row of dueRows) {
      const d = new Date(row.due_time);
      const idx = Math.round(
        (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - start) / 86_400_000
      );
      if (idx >= 0 && idx < 7) dueBuckets[idx] += 1;
    }
    return { ratings, total, dueBuckets };
  }

  static getDeck(db: Database.Database, deckId: number): FlashcardDeck | null {
    const row = db.prepare(`SELECT * FROM flashcard_decks WHERE id = ?`).get(deckId) as
      DeckRow | undefined;
    if (!row) return null;
    const stats = this.getDeckStatsMap(db).get(deckId);
    return this.mapDeckRow(row, stats);
  }

  static createDeck(
    db: Database.Database,
    payload: CreateFlashcardDeckInput,
    ctx: CommandContext = fallbackCommandContext
  ): FlashcardDeck {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO flashcard_decks (name, description, cover_color, emoji, sort_order, meta, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const res = stmt.run(
      payload.name,
      payload.description ?? "",
      payload.coverColor ?? DEFAULT_COLOR,
      payload.emoji ?? DEFAULT_EMOJI,
      payload.sortOrder ?? 0,
      payload.meta ? JSON.stringify(payload.meta) : null,
      now,
      now
    );
    const createdId = Number(res.lastInsertRowid);
    this.changed(db, ctx);
    return this.getDeck(db, createdId) as FlashcardDeck;
  }

  static updateDeck(
    db: Database.Database,
    payload: UpdateFlashcardDeckInput,
    ctx: CommandContext = fallbackCommandContext
  ): FlashcardDeck | null {
    const existing = this.getDeck(db, payload.id);
    if (!existing) return null;
    const now = Date.now();
    db.prepare(
      `UPDATE flashcard_decks 
       SET name = ?, description = ?, cover_color = ?, emoji = ?, sort_order = ?, meta = ?, update_time = ?
       WHERE id = ?`
    ).run(
      payload.name ?? existing.name,
      payload.description ?? existing.description,
      payload.coverColor ?? existing.coverColor,
      payload.emoji ?? existing.emoji,
      payload.sortOrder ?? existing.sortOrder,
      payload.meta
        ? JSON.stringify(payload.meta)
        : existing.meta
          ? JSON.stringify(existing.meta)
          : null,
      now,
      payload.id
    );
    this.changed(db, ctx);
    return this.getDeck(db, payload.id);
  }

  static deleteDeck(
    db: Database.Database,
    deckId: number,
    ctx: CommandContext = fallbackCommandContext
  ): boolean {
    const cardRows = db.prepare(`SELECT id FROM flashcards WHERE deck_id = ?`).all(deckId) as {
      id: number;
    }[];
    const cardIds = cardRows.map(row => row.id);
    if (cardIds.length) {
      this.detachReferences(db, cardIds)();
      const placeholders = cardIds.map(() => "?").join(",");
      db.prepare(`DELETE FROM flashcard_reviews WHERE card_id IN (${placeholders})`).run(
        ...cardIds
      );
    }
    db.prepare(`DELETE FROM flashcards WHERE deck_id = ?`).run(deckId);
    const result = db.prepare(`DELETE FROM flashcard_decks WHERE id = ?`).run(deckId);
    const deleted = result.changes > 0;
    if (deleted) this.changed(db, ctx);
    return deleted;
  }

  static listFlashcards(
    db: Database.Database,
    params: {
      deckId?: number;
      search?: string;
      tag?: string;
      limit?: number;
      statuses?: Flashcard["status"][];
    } = {}
  ): Flashcard[] {
    const conditions: string[] = ["1=1"];
    const values: any[] = [];

    if (typeof params.deckId === "number") {
      conditions.push("deck_id = ?");
      values.push(params.deckId);
    }

    if (params.statuses && params.statuses.length > 0) {
      const placeholders = params.statuses.map(() => "?").join(",");
      conditions.push(`status IN (${placeholders})`);
      values.push(...params.statuses);
    }

    if (params.tag) {
      conditions.push("tags LIKE ?");
      values.push(`%${params.tag}%`);
    }

    if (params.search) {
      conditions.push("(prompt LIKE ? OR detail LIKE ?)");
      values.push(`%${params.search}%`, `%${params.search}%`);
    }

    let sql = `SELECT * FROM flashcards WHERE ${conditions.join(" AND ")} ORDER BY update_time DESC`;
    if (params.limit) {
      sql += " LIMIT ?";
      values.push(params.limit);
    }

    const rows = db.prepare(sql).all(...values) as CardRow[];
    const referenceMap = this.getReferencesByCardIds(
      db,
      rows.map(row => row.id)
    );
    return rows.map(row => this.mapCardRow(row, referenceMap[row.id] ?? []));
  }

  static getFlashcard(db: Database.Database, cardId: number): Flashcard | null {
    const row = db.prepare(`SELECT * FROM flashcards WHERE id = ?`).get(cardId) as
      CardRow | undefined;
    if (!row) return null;
    const references = this.getReferencesByCardIds(db, [cardId])[cardId] ?? [];
    return this.mapCardRow(row, references);
  }

  static createFlashcard(
    db: Database.Database,
    payload: CreateFlashcardInput,
    ctx: CommandContext = fallbackCommandContext
  ): Flashcard {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO flashcards (
        deck_id, type, prompt, detail, data, tags, difficulty, review_level,
        due_time, last_review_time, review_count, ease_factor, status,
        reference_summary, create_time, update_time
      ) VALUES (
        @deckId, @type, @prompt, @detail, @data, @tags, @difficulty, @reviewLevel,
        @dueTime, @lastReviewTime, @reviewCount, @easeFactor, @status,
        @referenceSummary, @createTime, @updateTime
      )
    `);

    // Serialize Descendant[] to JSON strings
    const promptJson = JSON.stringify(payload.prompt);
    const detailJson = JSON.stringify(
      payload.detail ?? [{ type: "paragraph", children: [{ type: "formatted", text: "" }] }]
    );

    const res = stmt.run({
      deckId: payload.deckId,
      type: payload.type,
      prompt: promptJson,
      detail: detailJson,
      data: JSON.stringify(payload.data ?? {}),
      tags: JSON.stringify(payload.tags ?? []),
      difficulty: payload.difficulty ?? "standard",
      reviewLevel: 0,
      dueTime: now,
      lastReviewTime: null,
      reviewCount: 0,
      easeFactor: 2.5,
      status: "new",
      referenceSummary: null,
      createTime: now,
      updateTime: now,
    });
    const cardId = Number(res.lastInsertRowid);
    this.replaceReferences(db, cardId, payload.references);
    this.updateReferenceSummary(db, cardId);
    this.changed(db, ctx);
    return this.getFlashcard(db, cardId) as Flashcard;
  }

  static updateFlashcard(
    db: Database.Database,
    payload: UpdateFlashcardInput,
    ctx: CommandContext = fallbackCommandContext
  ): Flashcard | null {
    const existingRow = db.prepare(`SELECT * FROM flashcards WHERE id = ?`).get(payload.id) as
      CardRow | undefined;
    if (!existingRow) return null;
    const now = Date.now();

    // Serialize prompt and detail if provided
    const promptJson = payload.prompt ? JSON.stringify(payload.prompt) : existingRow.prompt;
    const detailJson = payload.detail ? JSON.stringify(payload.detail) : existingRow.detail;

    db.prepare(
      `UPDATE flashcards SET
        deck_id = ?,
        type = ?,
        prompt = ?,
        detail = ?,
        data = ?,
        tags = ?,
        difficulty = ?,
        status = ?,
        update_time = ?
       WHERE id = ?`
    ).run(
      payload.deckId ?? existingRow.deck_id,
      payload.type ?? existingRow.type,
      promptJson,
      detailJson,
      payload.data ? JSON.stringify(payload.data) : existingRow.data,
      payload.tags ? JSON.stringify(payload.tags) : existingRow.tags,
      payload.difficulty ?? existingRow.difficulty,
      payload.status ?? existingRow.status,
      now,
      payload.id
    );

    if (payload.references) {
      this.replaceReferences(db, payload.id, payload.references);
      this.updateReferenceSummary(db, payload.id);
    }

    this.changed(db, ctx);
    return this.getFlashcard(db, payload.id);
  }

  static deleteFlashcard(
    db: Database.Database,
    cardId: number,
    ctx: CommandContext = fallbackCommandContext
  ): boolean {
    this.detachReferences(db, [cardId])();
    db.prepare(`DELETE FROM flashcard_reviews WHERE card_id = ?`).run(cardId);
    const result = db.prepare(`DELETE FROM flashcards WHERE id = ?`).run(cardId);
    const deleted = result.changes > 0;
    if (deleted) this.changed(db, ctx);
    return deleted;
  }

  static getReviewQueue(db: Database.Database, params: FlashcardQueueRequest = {}): Flashcard[] {
    const now = Date.now();
    const conditions = [];
    const values: any[] = [];

    if (typeof params.deckId === "number") {
      conditions.push("deck_id = ?");
      values.push(params.deckId);
    }

    if (params.statuses && params.statuses.length > 0) {
      const placeholders = params.statuses.map(() => "?").join(",");
      conditions.push(`status IN (${placeholders})`);
      values.push(...params.statuses);
    } else {
      // 暂停的卡不进复习队列（未显式指定状态时）
      conditions.push("status != 'suspended'");
    }

    if (!params.includeUpcoming) {
      conditions.push("due_time <= ?");
      values.push(now);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    let sql = `
      SELECT * FROM flashcards
      ${whereClause}
      ORDER BY
        CASE WHEN due_time <= ${now} THEN 0 ELSE 1 END,
        due_time ASC,
        review_level ASC
    `;
    if (params.limit) {
      sql += " LIMIT ?";
      values.push(params.limit);
    }

    const rows = db.prepare(sql).all(...values) as CardRow[];
    const referenceMap = this.getReferencesByCardIds(
      db,
      rows.map(row => row.id)
    );
    return rows.map(row => this.mapCardRow(row, referenceMap[row.id] ?? []));
  }

  private static calculateSchedule(row: CardRow, rating: FlashcardReviewRating) {
    const now = Date.now();
    const delta = RATING_DELTA[rating] ?? 0;
    let nextLevel = row.review_level + delta;
    if (rating === "struggle" && delta >= 0) {
      nextLevel = Math.max(row.review_level - 1, 0);
    }
    nextLevel = Math.max(0, Math.min(REVIEW_INTERVALS.length - 1, nextLevel));

    const nextEase = Math.min(
      EASE_RANGE.max,
      Math.max(EASE_RANGE.min, row.ease_factor + (EASE_DELTA[rating] ?? 0))
    );
    const baseInterval = REVIEW_INTERVALS[nextLevel];
    const dueTime = now + Math.round(baseInterval * (0.8 + nextEase * 0.2));
    const interval = dueTime - now;
    const reviewCount = (row.review_count ?? 0) + 1;
    const status = reviewCount >= 3 && rating !== "hard" ? "review" : "learning";
    return { nextLevel, nextEase, dueTime, interval, status };
  }

  static submitReview(
    db: Database.Database,
    payload: FlashcardReviewPayload,
    ctx: CommandContext = fallbackCommandContext
  ): FlashcardReviewResult | null {
    const result = db.transaction(() => {
      const row = db.prepare(`SELECT * FROM flashcards WHERE id = ?`).get(payload.cardId) as
        CardRow | undefined;
      if (!row) return null;

      const { nextLevel, nextEase, dueTime, interval, status } = this.calculateSchedule(
        row,
        payload.rating
      );
      const now = Date.now();

      db.prepare(
        `UPDATE flashcards SET
        review_level = ?,
        due_time = ?,
        last_review_time = ?,
        review_count = review_count + 1,
        ease_factor = ?,
        status = ?,
        update_time = ?
       WHERE id = ?`
      ).run(nextLevel, dueTime, now, nextEase, status, now, payload.cardId);

      // INTEGER PRIMARY KEY 会复用刚撤销的最大 ID；会话内保留高水位，避免旧凭据命中新记录。
      const maxReviewId =
        (db.prepare("SELECT MAX(id) AS id FROM flashcard_reviews").get() as { id: number | null })
          .id ?? 0;
      const reviewId = Math.max(maxReviewId, this.reviewIdHighWater.get(db) ?? 0) + 1;
      this.reviewIdHighWater.set(db, reviewId);
      db.prepare(
        `INSERT INTO flashcard_reviews (id, card_id, deck_id, rating, review_time, interval, review_level, ease_factor, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        reviewId,
        payload.cardId,
        row.deck_id,
        payload.rating,
        now,
        interval,
        nextLevel,
        nextEase,
        payload.notes ?? null
      );

      const updated = this.getFlashcard(db, payload.cardId)!;
      return {
        ...updated,
        undo: {
          cardId: row.id,
          reviewId,
          previous: {
            reviewLevel: row.review_level,
            easeFactor: row.ease_factor,
            dueTime: row.due_time,
            lastReviewTime: row.last_review_time,
            reviewCount: row.review_count,
            status: row.status as Flashcard["status"],
          },
        },
      };
    })();
    if (result) this.changed(db, ctx);
    return result;
  }

  /**
   * 仅撤销凭据指向的最新评分；校验、删除记录与恢复排期在同一事务中完成。
   */
  static undoReview(
    db: Database.Database,
    payload: FlashcardUndoReviewPayload,
    ctx: CommandContext = fallbackCommandContext
  ): Flashcard | null {
    const { previous } = payload;
    const undo = db.transaction(() => {
      const row = db.prepare(`SELECT * FROM flashcards WHERE id = ?`).get(payload.cardId) as
        CardRow | undefined;
      if (!row) return null;
      const latest = db
        .prepare(
          `SELECT id, review_time, review_level, ease_factor FROM flashcard_reviews
         WHERE card_id = ? ORDER BY id DESC LIMIT 1`
        )
        .get(payload.cardId) as
        { id: number; review_time: number; review_level: number; ease_factor: number } | undefined;
      if (
        !latest ||
        latest.id !== payload.reviewId ||
        row.review_count !== previous.reviewCount + 1 ||
        row.last_review_time !== latest.review_time ||
        row.review_level !== latest.review_level ||
        row.ease_factor !== latest.ease_factor ||
        row.status === "suspended"
      ) {
        throw new Error("评分记录已变化，无法撤销");
      }
      db.prepare(`DELETE FROM flashcard_reviews WHERE id = ? AND card_id = ?`).run(
        payload.reviewId,
        payload.cardId
      );
      db.prepare(
        `UPDATE flashcards SET
          review_level = ?,
          due_time = ?,
          last_review_time = ?,
          review_count = ?,
          ease_factor = ?,
          status = ?,
          update_time = ?
         WHERE id = ?`
      ).run(
        previous.reviewLevel,
        previous.dueTime,
        previous.lastReviewTime,
        previous.reviewCount,
        previous.easeFactor,
        previous.status,
        Date.now(),
        payload.cardId
      );
      return this.getFlashcard(db, payload.cardId);
    });
    const result = undo();
    if (result) this.changed(db, ctx);
    return result;
  }
}

export default FlashcardTable;
