import Database from "better-sqlite3";
import log from "electron-log";
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
  FlashcardQueueRequest,
  FlashcardReviewRating,
} from "@/types";

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
  ref_type: string;
  ref_id: number | null;
  ref_label: string;
  ref_url: string | null;
  extra: string | null;
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
    };
  }

  static initTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS flashcard_decks (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        cover_color TEXT DEFAULT '${DEFAULT_COLOR}',
        emoji TEXT DEFAULT '${DEFAULT_EMOJI}',
        sort_order INTEGER DEFAULT 0,
        meta TEXT,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS flashcards (
        id INTEGER PRIMARY KEY,
        deck_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        prompt TEXT NOT NULL,
        detail TEXT DEFAULT '',
        data TEXT NOT NULL,
        tags TEXT DEFAULT '[]',
        difficulty TEXT DEFAULT 'standard',
        review_level INTEGER DEFAULT 0,
        due_time INTEGER NOT NULL,
        last_review_time INTEGER,
        review_count INTEGER DEFAULT 0,
        ease_factor REAL DEFAULT 2.5,
        status TEXT DEFAULT 'new',
        reference_summary TEXT,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        FOREIGN KEY(deck_id) REFERENCES flashcard_decks(id)
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS flashcard_reviews (
        id INTEGER PRIMARY KEY,
        card_id INTEGER NOT NULL,
        deck_id INTEGER NOT NULL,
        rating TEXT NOT NULL,
        review_time INTEGER NOT NULL,
        interval INTEGER NOT NULL,
        review_level INTEGER NOT NULL,
        ease_factor REAL NOT NULL,
        notes TEXT,
        FOREIGN KEY(card_id) REFERENCES flashcards(id),
        FOREIGN KEY(deck_id) REFERENCES flashcard_decks(id)
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS flashcard_references (
        id INTEGER PRIMARY KEY,
        card_id INTEGER NOT NULL,
        ref_type TEXT NOT NULL,
        ref_id INTEGER,
        ref_label TEXT NOT NULL,
        ref_url TEXT,
        extra TEXT,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        FOREIGN KEY(card_id) REFERENCES flashcards(id)
      );
    `);

    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_flashcards_deck ON flashcards(deck_id);",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_flashcards_due_time ON flashcards(due_time);",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_card ON flashcard_reviews(card_id);",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_flashcard_references_card ON flashcard_references(card_id);",
    );
  }

  static upgradeTable(db: Database.Database) {
    // 预留增量更新
    const deckInfo = db.prepare(`PRAGMA table_info(flashcard_decks)`).all() as {
      name: string;
    }[];
    const hasMeta = deckInfo.some((column) => column.name === "meta");
    if (!hasMeta) {
      db.exec(`ALTER TABLE flashcard_decks ADD COLUMN meta TEXT;`);
    }

    const cardInfo = db.prepare(`PRAGMA table_info(flashcards)`).all() as {
      name: string;
    }[];
    const referenceSummaryExists = cardInfo.some(
      (column) => column.name === "reference_summary",
    );
    if (!referenceSummaryExists) {
      db.exec(
        `ALTER TABLE flashcards ADD COLUMN reference_summary TEXT DEFAULT NULL;`,
      );
    }
  }

  private static parseJSON<T>(
    value: string | null | undefined,
    fallback: T,
  ): T {
    if (!value) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      log.error("[FlashcardTable] Failed to parse JSON", error);
      return fallback;
    }
  }

  private static mapDeckRow(
    row: DeckRow,
    stats?: FlashcardDeckStats,
  ): FlashcardDeck {
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

  private static mapReferenceRow(row: ReferenceRow): FlashcardReference {
    return {
      id: row.id,
      cardId: row.card_id,
      refType: row.ref_type as FlashcardReference["refType"],
      refId: row.ref_id,
      refLabel: row.ref_label,
      refUrl: row.ref_url,
      extra: this.parseJSON<Record<string, unknown> | null>(row.extra, null),
      createTime: row.create_time,
      updateTime: row.update_time,
    };
  }

  private static mapCardRow(
    row: CardRow,
    references: FlashcardReference[],
  ): Flashcard {
    return {
      id: row.id,
      deckId: row.deck_id,
      type: row.type as Flashcard["type"],
      prompt: row.prompt,
      detail: row.detail || "",
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

  private static getDeckStatsMap(
    db: Database.Database,
  ): Map<number, FlashcardDeckStats> {
    const now = Date.now();
    const rows = db
      .prepare(
        `
      SELECT
        deck_id,
        COUNT(*) AS total_cards,
        SUM(CASE WHEN review_count = 0 THEN 1 ELSE 0 END) AS new_cards,
        SUM(CASE WHEN due_time <= ? THEN 1 ELSE 0 END) AS due_cards,
        SUM(CASE WHEN status = 'learning' THEN 1 ELSE 0 END) AS learning_cards,
        MAX(last_review_time) AS last_review_time
      FROM flashcards
      GROUP BY deck_id
    `,
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
    rows.forEach((row) => {
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
    cardIds: number[],
  ): Record<number, FlashcardReference[]> {
    if (!cardIds.length) return {};
    const placeholders = cardIds.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT * FROM flashcard_references WHERE card_id IN (${placeholders})`,
      )
      .all(...cardIds) as ReferenceRow[];

    return rows.reduce<Record<number, FlashcardReference[]>>((acc, row) => {
      if (!acc[row.card_id]) {
        acc[row.card_id] = [];
      }
      acc[row.card_id].push(this.mapReferenceRow(row));
      return acc;
    }, {});
  }

  private static replaceReferences(
    db: Database.Database,
    cardId: number,
    references?: FlashcardReferenceInput[],
  ): FlashcardReference[] {
    db.prepare(`DELETE FROM flashcard_references WHERE card_id = ?`).run(
      cardId,
    );
    if (!references || references.length === 0) {
      return [];
    }
    const stmt = db.prepare(`
      INSERT INTO flashcard_references (card_id, ref_type, ref_id, ref_label, ref_url, extra, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    return references.map((ref) => {
      const res = stmt.run(
        cardId,
        ref.refType,
        ref.refId ?? null,
        ref.refLabel,
        ref.refUrl ?? null,
        ref.extra ? JSON.stringify(ref.extra) : null,
        now,
        now,
      );
      return {
        id: Number(res.lastInsertRowid),
        cardId,
        refType: ref.refType,
        refId: ref.refId ?? null,
        refLabel: ref.refLabel,
        refUrl: ref.refUrl ?? null,
        extra: ref.extra ?? null,
        createTime: now,
        updateTime: now,
      };
    });
  }

  private static updateReferenceSummary(db: Database.Database, cardId: number) {
    const labels = db
      .prepare(
        `SELECT ref_label FROM flashcard_references WHERE card_id = ? ORDER BY update_time DESC`,
      )
      .all(cardId) as { ref_label: string }[];
    const summary = labels
      .slice(0, 3)
      .map((item) => item.ref_label)
      .join(" · ");
    db.prepare(`UPDATE flashcards SET reference_summary = ? WHERE id = ?`).run(
      summary || null,
      cardId,
    );
  }

  static listDecks(db: Database.Database): FlashcardDeck[] {
    const decks = db
      .prepare(
        `SELECT * FROM flashcard_decks ORDER BY sort_order ASC, update_time DESC`,
      )
      .all() as DeckRow[];
    const statsMap = this.getDeckStatsMap(db);
    return decks.map((deck) =>
      this.mapDeckRow(
        deck,
        statsMap.get(deck.id) ?? {
          totalCards: 0,
          dueCount: 0,
          learningCount: 0,
          newCount: 0,
          lastReviewedTime: null,
        },
      ),
    );
  }

  static getDeck(db: Database.Database, deckId: number): FlashcardDeck | null {
    const row = db
      .prepare(`SELECT * FROM flashcard_decks WHERE id = ?`)
      .get(deckId) as DeckRow | undefined;
    if (!row) return null;
    const stats = this.getDeckStatsMap(db).get(deckId);
    return this.mapDeckRow(row, stats);
  }

  static createDeck(
    db: Database.Database,
    payload: CreateFlashcardDeckInput,
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
      now,
    );
    const createdId = Number(res.lastInsertRowid);
    return this.getDeck(db, createdId) as FlashcardDeck;
  }

  static updateDeck(
    db: Database.Database,
    payload: UpdateFlashcardDeckInput,
  ): FlashcardDeck | null {
    const existing = this.getDeck(db, payload.id);
    if (!existing) return null;
    const now = Date.now();
    db.prepare(
      `UPDATE flashcard_decks 
       SET name = ?, description = ?, cover_color = ?, emoji = ?, sort_order = ?, meta = ?, update_time = ?
       WHERE id = ?`,
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
      payload.id,
    );
    return this.getDeck(db, payload.id);
  }

  static deleteDeck(db: Database.Database, deckId: number): boolean {
    const cardRows = db
      .prepare(`SELECT id FROM flashcards WHERE deck_id = ?`)
      .all(deckId) as { id: number }[];
    const cardIds = cardRows.map((row) => row.id);
    if (cardIds.length) {
      const placeholders = cardIds.map(() => "?").join(",");
      db.prepare(
        `DELETE FROM flashcard_references WHERE card_id IN (${placeholders})`,
      ).run(...cardIds);
      db.prepare(
        `DELETE FROM flashcard_reviews WHERE card_id IN (${placeholders})`,
      ).run(...cardIds);
    }
    db.prepare(`DELETE FROM flashcards WHERE deck_id = ?`).run(deckId);
    const result = db
      .prepare(`DELETE FROM flashcard_decks WHERE id = ?`)
      .run(deckId);
    return result.changes > 0;
  }

  static listFlashcards(
    db: Database.Database,
    params: {
      deckId?: number;
      search?: string;
      tag?: string;
      limit?: number;
      statuses?: Flashcard["status"][];
    } = {},
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
      rows.map((row) => row.id),
    );
    return rows.map((row) => this.mapCardRow(row, referenceMap[row.id] ?? []));
  }

  static getFlashcard(db: Database.Database, cardId: number): Flashcard | null {
    const row = db
      .prepare(`SELECT * FROM flashcards WHERE id = ?`)
      .get(cardId) as CardRow | undefined;
    if (!row) return null;
    const references = this.getReferencesByCardIds(db, [cardId])[cardId] ?? [];
    return this.mapCardRow(row, references);
  }

  static createFlashcard(
    db: Database.Database,
    payload: CreateFlashcardInput,
  ): Flashcard {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO flashcards (
        deck_id, type, prompt, detail, data, tags, difficulty, review_level,
        due_time, last_review_time, review_count, ease_factor, status,
        reference_summary, create_time, update_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, 2.5, 'new', NULL, ?, ?)
    `);

    const res = stmt.run(
      payload.deckId,
      payload.type,
      payload.prompt,
      payload.detail ?? "",
      JSON.stringify(payload.data ?? {}),
      JSON.stringify(payload.tags ?? []),
      payload.difficulty ?? "standard",
      0,
      now,
      now,
      now,
    );
    const cardId = Number(res.lastInsertRowid);
    this.replaceReferences(db, cardId, payload.references);
    this.updateReferenceSummary(db, cardId);
    return this.getFlashcard(db, cardId) as Flashcard;
  }

  static updateFlashcard(
    db: Database.Database,
    payload: UpdateFlashcardInput,
  ): Flashcard | null {
    const existingRow = db
      .prepare(`SELECT * FROM flashcards WHERE id = ?`)
      .get(payload.id) as CardRow | undefined;
    if (!existingRow) return null;
    const now = Date.now();

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
       WHERE id = ?`,
    ).run(
      payload.deckId ?? existingRow.deck_id,
      payload.type ?? existingRow.type,
      payload.prompt ?? existingRow.prompt,
      payload.detail ?? existingRow.detail,
      payload.data ? JSON.stringify(payload.data) : existingRow.data,
      payload.tags ? JSON.stringify(payload.tags) : existingRow.tags,
      payload.difficulty ?? existingRow.difficulty,
      payload.status ?? existingRow.status,
      now,
      payload.id,
    );

    if (payload.references) {
      this.replaceReferences(db, payload.id, payload.references);
      this.updateReferenceSummary(db, payload.id);
    }

    return this.getFlashcard(db, payload.id);
  }

  static deleteFlashcard(db: Database.Database, cardId: number): boolean {
    db.prepare(`DELETE FROM flashcard_references WHERE card_id = ?`).run(
      cardId,
    );
    db.prepare(`DELETE FROM flashcard_reviews WHERE card_id = ?`).run(cardId);
    const result = db
      .prepare(`DELETE FROM flashcards WHERE id = ?`)
      .run(cardId);
    return result.changes > 0;
  }

  static getReviewQueue(
    db: Database.Database,
    params: FlashcardQueueRequest = {},
  ): Flashcard[] {
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
    }

    if (!params.includeUpcoming) {
      conditions.push("due_time <= ?");
      values.push(now);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
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
      rows.map((row) => row.id),
    );
    return rows.map((row) => this.mapCardRow(row, referenceMap[row.id] ?? []));
  }

  private static calculateSchedule(
    row: CardRow,
    rating: FlashcardReviewRating,
  ) {
    const now = Date.now();
    const delta = RATING_DELTA[rating] ?? 0;
    let nextLevel = row.review_level + delta;
    if (rating === "struggle" && delta >= 0) {
      nextLevel = Math.max(row.review_level - 1, 0);
    }
    nextLevel = Math.max(0, Math.min(REVIEW_INTERVALS.length - 1, nextLevel));

    const nextEase = Math.min(
      EASE_RANGE.max,
      Math.max(EASE_RANGE.min, row.ease_factor + (EASE_DELTA[rating] ?? 0)),
    );
    const baseInterval = REVIEW_INTERVALS[nextLevel];
    const dueTime = now + Math.round(baseInterval * (0.8 + nextEase * 0.2));
    const interval = dueTime - now;
    const reviewCount = (row.review_count ?? 0) + 1;
    const status =
      reviewCount >= 3 && rating !== "hard" ? "review" : "learning";
    return { nextLevel, nextEase, dueTime, interval, status };
  }

  static submitReview(
    db: Database.Database,
    payload: FlashcardReviewPayload,
  ): Flashcard | null {
    const row = db
      .prepare(`SELECT * FROM flashcards WHERE id = ?`)
      .get(payload.cardId) as CardRow | undefined;
    if (!row) return null;

    const { nextLevel, nextEase, dueTime, interval, status } =
      this.calculateSchedule(row, payload.rating);
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
       WHERE id = ?`,
    ).run(nextLevel, dueTime, now, nextEase, status, now, payload.cardId);

    db.prepare(
      `INSERT INTO flashcard_reviews (card_id, deck_id, rating, review_time, interval, review_level, ease_factor, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      payload.cardId,
      payload.deckId,
      payload.rating,
      now,
      interval,
      nextLevel,
      nextEase,
      payload.notes ?? null,
    );

    return this.getFlashcard(db, payload.cardId);
  }
}

export default FlashcardTable;
