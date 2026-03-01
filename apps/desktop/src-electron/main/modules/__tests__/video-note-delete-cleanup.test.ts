import Database from "better-sqlite3";
import { basename } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: () => [],
  },
  ipcMain: {
    handle: vi.fn(),
  },
}));

const mockFns = vi.hoisted(() => ({
  cleanupVideoNoteArtifacts: vi.fn(),
}));

vi.mock("../video-note-index-queue", () => ({
  default: {
    enqueueTask: vi.fn(),
    cleanupVideoNoteArtifacts: mockFns.cleanupVideoNoteArtifacts,
  },
}));

import MAIN_SCHEMA_SQL from "../../../../../../packages/db-schema/schema/main.sql?raw";
import ContentTable from "../tables/content";
import VideoNoteTable from "../tables/video-note";
import VideoNoteItemTable from "../tables/video-note-item";
import VideoNoteChatTable from "../tables/video-note-chat";

function createTestDatabase() {
  const db = new Database(":memory:");
  db.exec(MAIN_SCHEMA_SQL);
  VideoNoteItemTable.upgradeTable(db);
  VideoNoteTable.upgradeTable(db);
  VideoNoteChatTable.upgradeTable(db);
  return db;
}

describe("VideoNoteTable.deleteVideoNote", () => {
  let db: Database.Database;

  beforeEach(() => {
    mockFns.cleanupVideoNoteArtifacts.mockClear();
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("删除视频笔记时应清理卡片内容、聊天记录与索引清理调用", () => {
    const videoNote = VideoNoteTable.createEmptyVideoNote(db, {
      type: "local",
      filePath: "/tmp/video.mp4",
    });

    const contentId1 = ContentTable.createContent(db, {
      content: [{ type: "paragraph", children: [{ text: "卡片 1" }] }] as any,
      count: 1,
    });
    const contentId2 = ContentTable.createContent(db, {
      content: [{ type: "paragraph", children: [{ text: "卡片 2" }] }] as any,
      count: 1,
    });

    VideoNoteItemTable.create(db, {
      videoNoteId: videoNote.id,
      contentId: contentId1,
      title: "卡片 1",
    });
    VideoNoteItemTable.create(db, {
      videoNoteId: videoNote.id,
      contentId: contentId2,
      title: "卡片 2",
    });

    const rootChat = VideoNoteChatTable.createChat(db, {
      videoNoteId: videoNote.id,
      title: "主会话",
      messages: [] as any,
    });
    VideoNoteChatTable.createChat(db, {
      videoNoteId: videoNote.id,
      title: "分支会话",
      messages: [] as any,
      parentChatId: rootChat.id,
      branchIndex: 0,
    });

    const deleteChanges = VideoNoteTable.deleteVideoNote(db, videoNote.id);
    expect(deleteChanges).toBe(1);

    const noteCount = (
      db
        .prepare("SELECT COUNT(*) as count FROM video_notes WHERE id = ?")
        .get(videoNote.id) as { count: number }
    ).count;
    const itemCount = (
      db
        .prepare(
          "SELECT COUNT(*) as count FROM video_note_item WHERE video_note_id = ?",
        )
        .get(videoNote.id) as { count: number }
    ).count;
    const chatCount = (
      db
        .prepare(
          "SELECT COUNT(*) as count FROM video_note_chats WHERE video_note_id = ?",
        )
        .get(videoNote.id) as { count: number }
    ).count;
    const contentCount = (
      db
        .prepare("SELECT COUNT(*) as count FROM contents WHERE id IN (?, ?)")
        .get(contentId1, contentId2) as { count: number }
    ).count;

    expect(noteCount).toBe(0);
    expect(itemCount).toBe(0);
    expect(chatCount).toBe(0);
    expect(contentCount).toBe(0);
    expect(mockFns.cleanupVideoNoteArtifacts).toHaveBeenCalledWith(
      basename(db.name),
      videoNote.id,
    );
  });
});
