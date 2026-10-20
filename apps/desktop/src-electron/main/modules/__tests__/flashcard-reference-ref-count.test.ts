import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp",
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
  ipcMain: {
    handle: vi.fn(),
  },
}));

vi.mock("../video-note-index-queue", () => ({
  default: {
    enqueueTask: vi.fn(),
    cleanupVideoNoteArtifacts: vi.fn(),
  },
}));

import MAIN_SCHEMA_SQL from "../../../../../../packages/db-schema/schema/main.sql?raw";
import ContentTable from "../tables/content";
import FlashcardTable from "../tables/flashcard";
import type { FlashcardReferenceInput } from "@/types";
import { toPluginFlashcard } from "@/services/flashcard-results";

const paragraph = (text: string) =>
  [{ type: "paragraph", children: [{ type: "formatted", text }] }] as any;

function createTestDatabase() {
  const db = new Database(":memory:");
  db.exec(MAIN_SCHEMA_SQL);
  return db;
}

describe("FlashcardTable 参考资料引用计数", () => {
  let db: Database.Database;
  let deckId: number;
  let docContentId: number;

  const refCountOf = (contentId: number) =>
    (
      db.prepare("SELECT ref_count FROM contents WHERE id = ?").get(contentId) as
        { ref_count: number } | undefined
    )?.ref_count;

  const createCard = (references: FlashcardReferenceInput[]) =>
    FlashcardTable.createFlashcard(db, {
      deckId,
      type: "basic",
      prompt: paragraph("问题"),
      references,
    } as any);

  const contentRef = (): FlashcardReferenceInput => ({
    refType: "content",
    contentId: docContentId,
    title: "已有文档",
  });

  const customRef = (text: string): FlashcardReferenceInput => ({
    refType: "custom",
    title: "自定义资料",
    customContent: paragraph(text),
  });

  const customContentIdOf = (cardId: number) =>
    FlashcardTable.getFlashcard(db, cardId)!.references.find(ref => ref.refType === "custom")!
      .contentId;

  beforeEach(() => {
    db = createTestDatabase();
    deckId = FlashcardTable.createDeck(db, { name: "测试卡组" } as any).id;
    // 模拟文档自身持有的一份引用
    docContentId = ContentTable.createContent(db, {
      content: paragraph("文档正文"),
      count: 4,
    });
  });

  afterEach(() => {
    db.close();
  });

  it("真实数据库结果转换后保留自定义正文并能直接复用于建卡", () => {
    const stored = FlashcardTable.createFlashcard(db, {
      deckId,
      type: "qa",
      prompt: paragraph("问题"),
      data: { answer: "答案" },
      references: [contentRef(), customRef("自定义正文")],
    });
    const result = toPluginFlashcard(stored);
    const source = stored.references[0].content;
    if (!source) throw new Error("来源正文未读取");
    expect(stored.references[1]).not.toHaveProperty("customContent");
    expect(result.references).toEqual([
      {
        refType: "content",
        title: contentRef().title,
        contentRef: `${docContentId}:${source.createTime}`,
      },
      customRef("自定义正文"),
    ]);
    const copy = FlashcardTable.createFlashcard(db, {
      ...result,
      references: [contentRef(), customRef("自定义正文")],
    });
    expect(toPluginFlashcard(copy).references).toEqual(result.references);
    expect(copy.id).not.toBe(stored.id);
  });

  it("删除闪卡时释放 content 引用并回收 custom 内容", () => {
    const card = createCard([contentRef(), customRef("摘录")]);
    const customId = customContentIdOf(card.id);
    expect(refCountOf(docContentId)).toBe(2);
    expect(refCountOf(customId)).toBe(1);

    FlashcardTable.deleteFlashcard(db, card.id);

    expect(refCountOf(docContentId)).toBe(1);
    expect(refCountOf(customId)).toBeUndefined();
  });

  it("更新引用时释放旧引用，重复保存不再累加计数", () => {
    const card = createCard([contentRef(), customRef("v1")]);
    const oldCustomId = customContentIdOf(card.id);

    FlashcardTable.updateFlashcard(db, {
      id: card.id,
      references: [contentRef(), customRef("v2")],
    } as any);
    FlashcardTable.updateFlashcard(db, {
      id: card.id,
      references: [contentRef(), customRef("v3")],
    } as any);

    expect(refCountOf(docContentId)).toBe(2);
    expect(refCountOf(oldCustomId)).toBeUndefined();
    const contentRows = db.prepare("SELECT COUNT(*) AS n FROM contents").get() as {
      n: number;
    };
    // 文档正文 + 当前一份 custom 内容
    expect(contentRows.n).toBe(2);
  });

  it("闪卡是最后持有者时，保留同一引用的更新不会误删内容", () => {
    const card = createCard([contentRef()]);
    // 文档已删除，仅剩闪卡持有
    ContentTable.deleteContent(db, docContentId);
    expect(refCountOf(docContentId)).toBe(1);

    FlashcardTable.updateFlashcard(db, {
      id: card.id,
      references: [contentRef()],
    } as any);

    expect(refCountOf(docContentId)).toBe(1);
  });

  it("清空引用时全部释放", () => {
    const card = createCard([contentRef(), customRef("摘录")]);
    const customId = customContentIdOf(card.id);

    FlashcardTable.updateFlashcard(db, { id: card.id, references: [] } as any);

    expect(refCountOf(docContentId)).toBe(1);
    expect(refCountOf(customId)).toBeUndefined();
  });

  it("删除卡组时释放组内所有闪卡的引用", () => {
    const first = createCard([contentRef(), customRef("a")]);
    const second = createCard([contentRef(), customRef("b")]);
    const customIds = [customContentIdOf(first.id), customContentIdOf(second.id)];
    expect(refCountOf(docContentId)).toBe(3);

    FlashcardTable.deleteDeck(db, deckId);

    expect(refCountOf(docContentId)).toBe(1);
    customIds.forEach(id => expect(refCountOf(id)).toBeUndefined());
    const refRows = db.prepare("SELECT COUNT(*) AS n FROM flashcard_references").get() as {
      n: number;
    };
    expect(refRows.n).toBe(0);
  });
});
