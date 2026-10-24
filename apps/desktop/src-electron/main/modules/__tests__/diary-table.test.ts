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

it("正文创建与更新以扩展统计为准，不接受调用方的过时计数", async () => {
  const { installDesktopPluginMetrics } = await import("../../../../shared/content-metrics");
  const db = createTestDatabase();
  try {
    installDesktopPluginMetrics([{ type: "example.source", textFields: ["source"] }]);
    const content = [
      { type: "example.source", source: "你好世界", children: [{ text: "" }] },
    ] as unknown as Descendant[];
    const id = ContentTable.createContent(db, { content, count: 999 });
    expect(ContentTable.getContentById(db, id)?.count).toBe(4);
    ContentTable.updateContent(db, id, { content: paragraph("hello world"), count: 999 });
    expect(ContentTable.getContentById(db, id)?.count).toBe(2);
    ContentTable.updateContent(db, id, {
      content: [
        { type: "image", url: "image.png", children: [{ text: "" }] },
      ] as unknown as Descendant[],
      count: 999,
    });
    expect(ContentTable.getContentById(db, id)?.count).toBe(0);
  } finally {
    installDesktopPluginMetrics([]);
    db.close();
  }
});
