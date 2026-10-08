import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));

// 与 todo-calendar-consistency 同款：切断 tables → database 模块的循环依赖链
vi.mock("../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import MAIN_SCHEMA_SQL from "../../../../../../packages/db-schema/schema/main.sql?raw";
import FlashcardTable from "../tables/flashcard";

/** v4 库样本：旧调度列结构（review_level/ease_factor）+ 一张已学卡与历史评分 */
function v4Database() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE flashcard_decks (id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '',
      cover_color TEXT DEFAULT '#2563eb', emoji TEXT DEFAULT '🧠', sort_order INTEGER DEFAULT 0, meta TEXT,
      create_time INTEGER NOT NULL, update_time INTEGER NOT NULL);
    CREATE TABLE flashcards (id INTEGER PRIMARY KEY, deck_id INTEGER NOT NULL, type TEXT NOT NULL,
      prompt TEXT NOT NULL, detail TEXT DEFAULT '', data TEXT NOT NULL, tags TEXT DEFAULT '[]',
      difficulty TEXT DEFAULT 'standard', review_level INTEGER DEFAULT 0, due_time INTEGER NOT NULL,
      last_review_time INTEGER, review_count INTEGER DEFAULT 0, ease_factor REAL DEFAULT 2.5,
      status TEXT DEFAULT 'new', reference_summary TEXT, create_time INTEGER NOT NULL, update_time INTEGER NOT NULL);
    CREATE TABLE flashcard_reviews (id INTEGER PRIMARY KEY, card_id INTEGER NOT NULL, deck_id INTEGER NOT NULL,
      rating TEXT NOT NULL, review_time INTEGER NOT NULL, interval INTEGER NOT NULL,
      review_level INTEGER NOT NULL, ease_factor REAL NOT NULL, notes TEXT);
    CREATE TABLE flashcard_references (id INTEGER PRIMARY KEY, card_id INTEGER NOT NULL,
      content_id INTEGER NOT NULL, ref_type TEXT NOT NULL, title TEXT NOT NULL,
      create_time INTEGER NOT NULL, update_time INTEGER NOT NULL);
    CREATE TABLE contents (id INTEGER PRIMARY KEY, content TEXT, create_time INTEGER,
      update_time INTEGER, count INTEGER, ref_count INTEGER);
    INSERT INTO flashcard_decks VALUES (1, '卡组', '', '#2563eb', '🧠', 0, NULL, 0, 0);
    INSERT INTO flashcards VALUES (10, 1, 'qa', '[]', '[]', '{}', '[]', 'standard',
      3, 1000, 500, 2, 2.5, 'review', NULL, 0, 0);
    INSERT INTO flashcards VALUES (11, 1, 'qa', '[]', '[]', '{}', '[]', 'standard',
      0, 1000, NULL, 0, 2.5, 'new', NULL, 0, 0);
    INSERT INTO flashcard_reviews VALUES (1, 10, 1, 'normal', 500, 86400000, 1, 2.5, NULL);
    INSERT INTO flashcard_reviews VALUES (2, 10, 1, 'normal', 500, 604800000, 3, 2.5, NULL);
  `);
  return db;
}

describe("闪卡 FSRS 表迁移（upgradeTable）", () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  it("旧调度列重建为记忆状态列，已学卡按 SM-2 公式回填", () => {
    db = v4Database();
    FlashcardTable.upgradeTable(db);

    // 旧列退役、新列就位；ease 2.5 + 最近间隔 7 天 → 稳定性 7（0.9 保留率下=间隔天数）
    const learned = db
      .prepare(`SELECT memory_stability, memory_difficulty FROM flashcards WHERE id = 10`)
      .get() as { memory_stability: number; memory_difficulty: number };
    expect(Math.abs(learned.memory_stability - 7)).toBeLessThan(1e-6);
    expect(learned.memory_difficulty).toBeGreaterThan(1);
    expect(learned.memory_difficulty).toBeLessThan(10);

    // 新卡不回填；历史评分保留且快照列按默认 0 落库
    const fresh = db.prepare(`SELECT memory_stability FROM flashcards WHERE id = 11`).get() as {
      memory_stability: number | null;
    };
    expect(fresh.memory_stability).toBeNull();
    const history = db
      .prepare(
        `SELECT COUNT(*) AS n, MAX(stability) AS s FROM flashcard_reviews WHERE card_id = 10`
      )
      .get() as { n: number; s: number };
    expect(history.n).toBe(2);
    expect(history.s).toBe(0);

    // 迁移后调度链路可用
    const card = FlashcardTable.createFlashcard(db, {
      deckId: 1,
      type: "qa",
      prompt: [{ type: "paragraph", children: [{ type: "formatted", text: "q" }] }] as never,
      data: { answer: "a" },
    });
    const reviewed = FlashcardTable.submitReview(db, {
      cardId: card.id,
      deckId: 1,
      rating: "normal",
    })!;
    expect(reviewed.memoryStability).not.toBeNull();
  });

  it("重复执行幂等（新结构下 no-op），新库跳过迁移", () => {
    db = v4Database();
    FlashcardTable.upgradeTable(db);
    const snapshot = db.prepare(`SELECT COUNT(*) AS n FROM flashcards`).get() as { n: number };
    FlashcardTable.upgradeTable(db);
    expect((db.prepare(`SELECT COUNT(*) AS n FROM flashcards`).get() as { n: number }).n).toBe(
      snapshot.n
    );

    const fresh = new Database(":memory:");
    try {
      fresh.exec(MAIN_SCHEMA_SQL);
      const columnsBefore = (fresh.pragma("table_info(flashcards)") as Array<{ name: string }>).map(
        c => c.name
      );
      FlashcardTable.upgradeTable(fresh);
      expect(
        (fresh.pragma("table_info(flashcards)") as Array<{ name: string }>).map(c => c.name)
      ).toEqual(columnsBefore);
    } finally {
      fresh.close();
    }
  });

  /** 迁移是手写 DDL，钉住「迁移后列结构 == 全新建库列结构」，防止与 schema 分片漂移 */
  it("迁移后列结构与全新建库一致", () => {
    db = v4Database();
    FlashcardTable.upgradeTable(db);
    const fresh = new Database(":memory:");
    try {
      fresh.exec(MAIN_SCHEMA_SQL);
      for (const table of ["flashcards", "flashcard_reviews"]) {
        const columns = (conn: Database.Database) =>
          (conn.pragma(`table_info(${table})`) as Array<{ name: string; type: string }>).map(c => ({
            name: c.name,
            type: c.type,
          }));
        expect(columns(db)).toEqual(columns(fresh));
      }
      // 索引同样对齐
      const indexes = (conn: Database.Database) =>
        (conn.pragma("index_list(flashcards)") as Array<{ name: string }>).map(i => i.name).sort();
      expect(indexes(db)).toEqual(indexes(fresh));
    } finally {
      fresh.close();
    }
  });
});
