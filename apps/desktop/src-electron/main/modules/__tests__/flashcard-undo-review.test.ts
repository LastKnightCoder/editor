import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const paragraph = (text: string) => [
  { type: "paragraph", children: [{ type: "formatted", text }] },
];

describe("闪卡撤销评分", () => {
  let db: Database.Database;
  let deckId: number;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(MAIN_SCHEMA_SQL);
    deckId = FlashcardTable.createDeck(db, { name: "操作系统" }).id;
  });

  afterEach(() => {
    db.close();
  });

  const reviewCount = (cardId: number) =>
    (
      db.prepare(`SELECT COUNT(*) AS n FROM flashcard_reviews WHERE card_id = ?`).get(cardId) as {
        n: number;
      }
    ).n;

  it("删除最新一条复习记录并恢复评分前的排期", () => {
    const card = FlashcardTable.createFlashcard(db, {
      deckId,
      type: "qa",
      prompt: paragraph("死锁的四个必要条件？") as never,
      data: { answer: "互斥、占有并等待、不可抢占、循环等待" },
    });
    const first = FlashcardTable.submitReview(db, { cardId: card.id, deckId, rating: "normal" })!;
    const beforeSecond = {
      memoryStability: first.memoryStability,
      memoryDifficulty: first.memoryDifficulty,
      dueTime: first.dueTime,
      lastReviewTime: first.lastReviewTime,
      reviewCount: first.reviewCount,
      status: first.status,
    };
    const second = FlashcardTable.submitReview(db, { cardId: card.id, deckId, rating: "easy" })!;
    expect(reviewCount(card.id)).toBe(2);

    expect(second.undo.previous).toEqual(beforeSecond);
    const restored = FlashcardTable.undoReview(db, second.undo)!;
    expect(reviewCount(card.id)).toBe(1);
    expect(restored).toMatchObject(beforeSecond);
    const kept = db
      .prepare(`SELECT rating FROM flashcard_reviews WHERE card_id = ?`)
      .get(card.id) as { rating: string };
    expect(kept.rating).toBe("normal");
  });

  it("卡片不存在时返回 null 且不动其它记录", () => {
    const card = FlashcardTable.createFlashcard(db, {
      deckId,
      type: "boolean",
      prompt: paragraph("线程切换不需要切换页表") as never,
      data: { booleanAnswer: true },
    });
    FlashcardTable.submitReview(db, { cardId: card.id, deckId, rating: "hard" });
    const result = FlashcardTable.undoReview(db, {
      cardId: card.id + 999,
      reviewId: 999,
      previous: {
        memoryStability: null,
        memoryDifficulty: null,
        dueTime: 0,
        lastReviewTime: null,
        reviewCount: 0,
        status: "new",
      },
    });
    expect(result).toBeNull();
    expect(reviewCount(card.id)).toBe(1);
  });

  it("旧凭据不能撤销另一次评分，重复撤销也不能改写排期", () => {
    const card = FlashcardTable.createFlashcard(db, {
      deckId,
      type: "qa",
      prompt: paragraph("问题") as never,
      data: { answer: "答案" },
    });
    const first = FlashcardTable.submitReview(db, { cardId: card.id, deckId, rating: "normal" })!;
    const second = FlashcardTable.submitReview(db, { cardId: card.id, deckId, rating: "easy" })!;
    expect(() => FlashcardTable.undoReview(db, first.undo)).toThrow("评分记录已变化");
    expect(reviewCount(card.id)).toBe(2);
    expect(FlashcardTable.getFlashcard(db, card.id)?.reviewCount).toBe(2);
    FlashcardTable.undoReview(db, second.undo);
    expect(() => FlashcardTable.undoReview(db, second.undo)).toThrow("评分记录已变化");
    expect(reviewCount(card.id)).toBe(1);
  });

  it("撤销后重新评分不会复用旧凭据的记录 ID", () => {
    const card = FlashcardTable.createFlashcard(db, {
      deckId,
      type: "qa",
      prompt: paragraph("问题") as never,
      data: { answer: "答案" },
    });
    const first = FlashcardTable.submitReview(db, { cardId: card.id, deckId, rating: "normal" })!;
    FlashcardTable.undoReview(db, first.undo);
    const second = FlashcardTable.submitReview(db, { cardId: card.id, deckId, rating: "normal" })!;
    expect(second.undo.reviewId).not.toBe(first.undo.reviewId);
    expect(() => FlashcardTable.undoReview(db, first.undo)).toThrow("评分记录已变化");
    expect(reviewCount(card.id)).toBe(1);
  });

  it("写入评分记录失败时排期一并回滚", () => {
    const card = FlashcardTable.createFlashcard(db, {
      deckId,
      type: "qa",
      prompt: paragraph("问题") as never,
      data: { answer: "答案" },
    });
    db.exec(`CREATE TRIGGER reject_review BEFORE INSERT ON flashcard_reviews
      BEGIN SELECT RAISE(ABORT, 'test failure'); END;`);
    expect(() =>
      FlashcardTable.submitReview(db, { cardId: card.id, deckId, rating: "easy" })
    ).toThrow("test failure");
    expect(FlashcardTable.getFlashcard(db, card.id)).toEqual(card);
    expect(reviewCount(card.id)).toBe(0);
  });
});
