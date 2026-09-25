import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Descendant } from "slate";

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
import DiaryTable from "../tables/diary";
import {
  registerContentSession,
  unregisterContentSession,
} from "../collaboration/content-sessions";
import type { RuntimeSession } from "../collaboration/types";

const paragraph = (text: string): Descendant[] => [
  { type: "paragraph", children: [{ text }] } as Descendant,
];

function createTestDatabase() {
  const db = new Database(":memory:");
  db.exec(MAIN_SCHEMA_SQL);
  DiaryTable.upgradeTable(db);
  return db;
}

function createLegacyDatabase() {
  const db = new Database(":memory:");
  db.exec(MAIN_SCHEMA_SQL);
  return db;
}

describe("DiaryTable", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db?.close();
  });

  it("整体更新 content 时只覆盖首个 segment 并同步 word_count", () => {
    const entry = DiaryTable.createDiaryEntry(db, {
      type: "daily",
      date: "2026-06-21",
      weather: null,
      mood: null,
      tags: "[]",
      content: paragraph("旧"),
    });

    DiaryTable.updateDiaryEntry(
      db,
      {
        id: entry.id,
        content: paragraph("更新后"),
      },
      { broadcastOthers: vi.fn() } as never
    );

    const refreshed = DiaryTable.getDiaryEntryById(db, entry.id);
    const dbRow = db.prepare("SELECT word_count FROM diary_entries WHERE id = ?").get(entry.id) as {
      word_count: number;
    };
    const contentCounts = refreshed.segments.map(segment => {
      const content = ContentTable.getContentById(db, segment.contentId);
      return content?.count ?? 0;
    });

    expect(refreshed.segments).toHaveLength(1);
    expect(refreshed.content).toEqual(paragraph("更新后"));
    expect(dbRow.word_count).toBe(contentCounts.reduce((sum, count) => sum + count, 0));
    expect(refreshed.wordCount).toBe(dbRow.word_count);
  });

  it("content 挂协作会话时更新 segment 跳过内容替换并维护元数据", () => {
    const entry = DiaryTable.createDiaryEntry(db, {
      type: "daily",
      date: "2026-09-13",
      weather: null,
      mood: null,
      tags: "[]",
      segments: [paragraph("旧内容")],
    });
    const [segment] = entry.segments;
    const { create_time: contentCreatedAt } = db
      .prepare("SELECT create_time FROM contents WHERE id = ?")
      .get(segment.contentId) as { create_time: number };
    const session = {
      info: { source: { contentCreatedAt } },
    } as unknown as RuntimeSession;
    registerContentSession(db, segment.contentId, session);

    // 协作模式下内容由会话投影负责，修复前这里必抛 CONTENT_VERSION_CONFLICT
    const updated = DiaryTable.updateDiarySegment(
      db,
      { segmentId: segment.id, content: paragraph("新内容") },
      {} as never
    );

    const rawContent = db
      .prepare("SELECT content FROM contents WHERE id = ?")
      .get(segment.contentId) as { content: string };
    expect(JSON.parse(rawContent.content)).toEqual(paragraph("旧内容"));
    expect(updated?.id).toBe(segment.id);
    const operationCount = db
      .prepare(
        "SELECT COUNT(*) as count FROM operation WHERE operation_content_type = 'diary-entry' AND operation_action = 'update' AND operation_id = ?"
      )
      .get(entry.id) as { count: number };
    expect(operationCount.count).toBe(1);

    unregisterContentSession(session);
  });

  it("删除单个 segment 时先解除 diary_segments 外键再删除 content", () => {
    const entry = DiaryTable.createDiaryEntry(db, {
      type: "daily",
      date: "2026-06-22",
      weather: null,
      mood: null,
      tags: "[]",
      segments: [paragraph("第一段"), paragraph("第二段")],
    });
    const [firstSegment] = entry.segments;

    expect(() => DiaryTable.deleteDiarySegment(db, firstSegment.id)).not.toThrow();

    const deletedSegment = db
      .prepare("SELECT id FROM diary_segments WHERE id = ?")
      .get(firstSegment.id);
    const deletedContent = ContentTable.getContentById(db, firstSegment.contentId);

    expect(deletedSegment).toBeUndefined();
    expect(deletedContent).toBeNull();
  });

  it("删除旧数据迁移出的 segment 时会清理 diary_entries.content_id 残留引用", () => {
    const entry = DiaryTable.createDiaryEntry(db, {
      type: "daily",
      date: "2026-06-24",
      weather: null,
      mood: null,
      tags: "[]",
      segments: [paragraph("旧模型残留引用")],
    });
    const [segment] = entry.segments;
    db.prepare("UPDATE diary_entries SET content_id = ? WHERE id = ?").run(
      segment.contentId,
      entry.id
    );

    expect(() => DiaryTable.deleteDiarySegment(db, segment.id)).not.toThrow();

    const entryRow = db
      .prepare("SELECT content_id FROM diary_entries WHERE id = ?")
      .get(entry.id) as { content_id: number | null };

    expect(entryRow.content_id).toBeNull();
    expect(ContentTable.getContentById(db, segment.contentId)).toBeNull();
  });

  it("删除 diary entry 时逐段解除外键再删除 content", () => {
    const entry = DiaryTable.createDiaryEntry(db, {
      type: "daily",
      date: "2026-06-23",
      weather: null,
      mood: null,
      tags: "[]",
      segments: [paragraph("第一段"), paragraph("第二段")],
    });
    const contentIds = entry.segments.map(segment => segment.contentId);

    expect(() => DiaryTable.deleteDiaryEntry(db, entry.id)).not.toThrow();

    const remainingSegments = db
      .prepare("SELECT COUNT(*) as count FROM diary_segments WHERE diary_id = ?")
      .get(entry.id) as { count: number };
    const remainingContents = contentIds
      .map(contentId => ContentTable.getContentById(db, contentId))
      .filter(Boolean);

    expect(remainingSegments.count).toBe(0);
    expect(remainingContents).toHaveLength(0);
  });

  it("从 daily_notes 迁移时使用 date 作为归属日期并保留内容创建时间", () => {
    db.close();
    db = createLegacyDatabase();

    const createdAt = new Date("2026-05-25T08:18:00").getTime();
    const insertContent = db.prepare(`
      INSERT INTO contents (create_time, update_time, content, count, ref_count)
      VALUES (?, ?, ?, ?, 1)
    `);
    const insertNote = db.prepare(`
      INSERT INTO daily_notes (date, content_id)
      VALUES (?, ?)
    `);

    for (const date of ["2026-05-20", "2026-05-21", "2026-05-22", "2026-05-23", "2026-05-24"]) {
      const contentId = Number(
        insertContent.run(createdAt, createdAt, JSON.stringify(paragraph(date)), 1).lastInsertRowid
      );
      insertNote.run(date, contentId);
    }

    DiaryTable.upgradeTable(db);

    const entries = DiaryTable.getAllDiaryEntries(db);
    const flatItems = DiaryTable.getAllDiarySegmentsFlat(db);

    expect(entries.map(entry => entry.date)).toEqual([
      "2026-05-24",
      "2026-05-23",
      "2026-05-22",
      "2026-05-21",
      "2026-05-20",
    ]);
    expect(new Set(entries.map(entry => entry.createTime))).toEqual(new Set([createdAt]));
    expect(flatItems.map(item => item.entryDate)).toEqual([
      "2026-05-24",
      "2026-05-23",
      "2026-05-22",
      "2026-05-21",
      "2026-05-20",
    ]);
    expect(flatItems.every(item => item.createTime === createdAt)).toBe(true);
    expect(flatItems[0].entryDateMs).toBe(new Date("2026-05-24T00:00:00").getTime());
  });

  it("daily_notes 部分迁移后再次升级会补迁剩余数据", () => {
    db.close();
    db = createLegacyDatabase();

    const createdAt = new Date("2026-05-25T08:18:00").getTime();
    const insertContent = db.prepare(`
      INSERT INTO contents (create_time, update_time, content, count, ref_count)
      VALUES (?, ?, ?, ?, 1)
    `);
    const insertNote = db.prepare(`
      INSERT INTO daily_notes (date, content_id)
      VALUES (?, ?)
    `);
    const contentId1 = Number(
      insertContent.run(createdAt, createdAt, JSON.stringify(paragraph("一")), 1).lastInsertRowid
    );
    const contentId2 = Number(
      insertContent.run(createdAt, createdAt, JSON.stringify(paragraph("二")), 1).lastInsertRowid
    );
    insertNote.run("2026-05-20", contentId1);
    insertNote.run("2026-05-21", contentId2);

    db.prepare(
      `INSERT INTO diary_entries (type, date, content_id, weather, mood, word_count, create_time, update_time)
       VALUES ('daily', '2026-05-20', ?, NULL, NULL, 1, ?, ?)`
    ).run(contentId1, createdAt, createdAt);

    DiaryTable.upgradeTable(db);

    const entries = DiaryTable.getAllDiaryEntries(db);
    expect(entries.map(entry => entry.date)).toEqual(["2026-05-21", "2026-05-20"]);
    expect(entries.every(entry => entry.segments.length === 1)).toBe(true);
  });

  it("daily_notes 迁移遇到同一天已有日记时追加为 segments", () => {
    db.close();
    db = createLegacyDatabase();

    const createdAt = new Date("2026-05-25T08:18:00").getTime();
    const insertContent = db.prepare(`
      INSERT INTO contents (create_time, update_time, content, count, ref_count)
      VALUES (?, ?, ?, ?, 1)
    `);
    const insertNote = db.prepare(`
      INSERT INTO daily_notes (date, content_id)
      VALUES (?, ?)
    `);
    const existingContentId = Number(
      insertContent.run(createdAt, createdAt, JSON.stringify(paragraph("已有正文")), 2)
        .lastInsertRowid
    );
    const noteContentId1 = Number(
      insertContent.run(createdAt + 1, createdAt + 1, JSON.stringify(paragraph("旧笔记一")), 3)
        .lastInsertRowid
    );
    const noteContentId2 = Number(
      insertContent.run(createdAt + 2, createdAt + 2, JSON.stringify(paragraph("旧笔记二")), 4)
        .lastInsertRowid
    );

    db.prepare(
      `INSERT INTO diary_entries (type, date, content_id, weather, mood, word_count, create_time, update_time)
       VALUES ('daily', '2026-05-20', ?, NULL, NULL, 2, ?, ?)`
    ).run(existingContentId, createdAt, createdAt);
    insertNote.run("2026-05-20", noteContentId1);
    insertNote.run("2026-05-20", noteContentId2);

    DiaryTable.upgradeTable(db);

    const entries = DiaryTable.getAllDiaryEntries(db);
    expect(entries).toHaveLength(1);
    expect(entries[0].date).toBe("2026-05-20");
    expect(entries[0].segments.map(segment => segment.contentId)).toEqual([
      existingContentId,
      noteContentId1,
      noteContentId2,
    ]);
    expect(entries[0].wordCount).toBe(9);
  });

  it("daily_notes 迁移创建新日记时兼容尚未添加 tags 列的旧库", () => {
    db.close();
    db = createLegacyDatabase();
    db.prepare(`ALTER TABLE diary_entries DROP COLUMN tags`).run();

    const createdAt = new Date("2026-05-25T08:18:00").getTime();
    const contentId = Number(
      db
        .prepare(
          `INSERT INTO contents (create_time, update_time, content, count, ref_count)
           VALUES (?, ?, ?, ?, 1)`
        )
        .run(createdAt, createdAt, JSON.stringify(paragraph("旧笔记")), 3).lastInsertRowid
    );
    db.prepare(`INSERT INTO daily_notes (date, content_id) VALUES (?, ?)`).run(
      "2026-05-20",
      contentId
    );

    expect(() => DiaryTable.upgradeTable(db)).not.toThrow();

    const entry = db
      .prepare(`SELECT date, tags FROM diary_entries WHERE date = ?`)
      .get("2026-05-20") as { date: string; tags: string };
    expect(entry).toEqual({ date: "2026-05-20", tags: "[]" });
  });

  it("标签迁移不会在后续升级中覆盖用户清空的标签和自定义颜色", () => {
    db.close();
    db = createLegacyDatabase();

    db.prepare(
      `INSERT INTO diary_entries (type, date, content_id, weather, mood, tags, word_count, create_time, update_time)
       VALUES ('weekly', '2026-W25', NULL, NULL, NULL, '[]', 0, 1, 1)`
    ).run();
    db.prepare(
      `INSERT INTO diary_tag_settings (name, color, sort, create_time, update_time)
       VALUES ('周记', '#000000', 9, 1, 1)`
    ).run();

    DiaryTable.upgradeTable(db);

    const entry = db.prepare(`SELECT tags FROM diary_entries WHERE type = 'weekly'`).get() as {
      tags: string;
    };
    const setting = db
      .prepare(`SELECT color, sort FROM diary_tag_settings WHERE name = '周记'`)
      .get() as { color: string; sort: number };

    expect(entry.tags).toBe("[]");
    expect(setting).toEqual({ color: "#000000", sort: 9 });
  });

  // 产品设计：标签与具体 segment 绑定，同一天多条日记各自独立打标签
  it("同一天的多个 segment 标签相互独立，更新互不影响", () => {
    const entry = DiaryTable.createDiaryEntry(db, {
      type: "daily",
      date: "2026-09-13",
      weather: null,
      mood: null,
      tags: "[]",
      segments: [paragraph("第一条"), paragraph("第二条")],
    });

    const first = entry.segments[0];

    const updatedFirst = DiaryTable.updateDiarySegment(db, {
      segmentId: first.id,
      tags: ["日常"],
    });
    expect(JSON.parse(updatedFirst!.tags)).toEqual(["日常"]);

    const reloaded = DiaryTable.getDiarySegments(db, entry.id);
    expect(reloaded.map(segment => JSON.parse(segment.tags))).toEqual([["日常"], []]);
  });

  it("旧库 entry 级标签在升级时回填到当天全部 segment", () => {
    db.close();
    db = createLegacyDatabase();

    db.exec(`ALTER TABLE diary_segments DROP COLUMN tags`);
    db.prepare(
      `INSERT INTO contents (create_time, update_time, content, count, ref_count)
       VALUES (1, 1, '[]', 0, 1)`
    ).run();
    db.prepare(
      `INSERT INTO diary_entries (type, date, content_id, weather, mood, tags, word_count, create_time, update_time)
       VALUES ('daily', '2026-09-13', NULL, NULL, NULL, '["日常","反思"]', 0, 1, 1)`
    ).run();
    db.prepare(
      `INSERT INTO diary_segments (diary_id, content_id, create_time, update_time)
       VALUES (1, 1, 1, 1), (1, 1, 2, 2)`
    ).run();

    DiaryTable.upgradeTable(db);

    const rows = db.prepare(`SELECT tags FROM diary_segments ORDER BY id`).all() as Array<{
      tags: string;
    }>;
    expect(rows).toHaveLength(2);
    expect(JSON.parse(rows[0].tags)).toEqual(["日常", "反思"]);
    expect(JSON.parse(rows[1].tags)).toEqual(["日常", "反思"]);
  });

  it("删除标签库中的标签会级联摘除所有 segment 上的该标签", () => {
    db.prepare(
      `INSERT INTO diary_tag_settings (name, color, sort, create_time, update_time)
       VALUES ('日常', '#1890ff', 0, 1, 1)`
    ).run();
    const entry = DiaryTable.createDiaryEntry(db, {
      type: "daily",
      date: "2026-09-14",
      weather: null,
      mood: null,
      tags: "[]",
      segments: [paragraph("a"), paragraph("b")],
    });
    DiaryTable.updateDiarySegment(db, { segmentId: entry.segments[0].id, tags: ["日常", "读书"] });
    DiaryTable.updateDiarySegment(db, { segmentId: entry.segments[1].id, tags: ["日常"] });

    DiaryTable.deleteDiaryTagSetting(db, "日常");

    const rows = db.prepare(`SELECT tags FROM diary_segments ORDER BY id`).all() as Array<{
      tags: string;
    }>;
    expect(JSON.parse(rows[0].tags)).toEqual(["读书"]);
    expect(JSON.parse(rows[1].tags)).toEqual([]);
  });

  it("create-diary-moment 当天无 entry 时建 entry，再次发布复用同一 entry 并写段级标签", () => {
    const first = DiaryTable.createDiaryMoment(db, {
      date: "2026-09-25",
      content: paragraph("第一条"),
      tags: ["工作", " 工作 ", ""],
    });
    const second = DiaryTable.createDiaryMoment(db, {
      date: "2026-09-25",
      content: paragraph("第二条"),
    });

    expect(first.entryDate).toBe("2026-09-25");
    expect(first.tags).toBe(JSON.stringify(["工作"]));
    expect(second.diaryId).toBe(first.diaryId);
    expect(second.tags).toBe("[]");
    expect(DiaryTable.getAllDiaryEntries(db)).toHaveLength(1);
    expect(DiaryTable.getDiaryEntryById(db, first.diaryId).segments).toHaveLength(2);
  });

  it("写命令经派发层调用时广播 diary:changed，读命令与无 ctx 调用不广播", () => {
    const broadcastOthers = vi.fn();
    const ctx = { broadcastOthers } as unknown as Parameters<
      typeof DiaryTable.updateDiarySegment
    >[2];
    const events = DiaryTable.getListenEvents() as Record<string, (...args: unknown[]) => unknown>;

    events["create-diary-moment"](db, { date: "2026-09-25", content: paragraph("x") }, ctx);
    events["get-all-diary-segments-flat"](db, ctx);
    events["create-diary-moment"](db, { date: "2026-09-25", content: paragraph("y") });

    expect(broadcastOthers).toHaveBeenCalledTimes(1);
    expect(broadcastOthers).toHaveBeenCalledWith("diary:changed", { databaseName: ":memory:" });
  });
});
