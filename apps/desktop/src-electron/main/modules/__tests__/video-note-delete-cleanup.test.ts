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
import ChatSessionTable from "../tables/chat-session";

function createTestDatabase() {
  const db = new Database(":memory:");
  db.exec(MAIN_SCHEMA_SQL);
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

    for (const id of ["chat-a", "chat-b"]) {
      ChatSessionTable.create(db, {
        id,
        scope: "video-note-chat",
        domainRef: String(videoNote.id),
        sessionFile: `${id}.jsonl`,
      });
    }
    // 别的视频笔记的对话不受影响
    ChatSessionTable.create(db, {
      id: "chat-other",
      scope: "video-note-chat",
      domainRef: String(videoNote.id + 1),
      sessionFile: "chat-other.jsonl",
    });

    const deleteChanges = VideoNoteTable.deleteVideoNote(db, videoNote.id);
    expect(deleteChanges).toBe(1);

    const noteCount = (
      db.prepare("SELECT COUNT(*) as count FROM video_notes WHERE id = ?").get(videoNote.id) as {
        count: number;
      }
    ).count;
    const itemCount = (
      db
        .prepare("SELECT COUNT(*) as count FROM video_note_item WHERE video_note_id = ?")
        .get(videoNote.id) as { count: number }
    ).count;
    const chatIds = ChatSessionTable.list(db, { scope: "video-note-chat" }).map(row => row.id);
    const contentCount = (
      db
        .prepare("SELECT COUNT(*) as count FROM contents WHERE id IN (?, ?)")
        .get(contentId1, contentId2) as { count: number }
    ).count;

    expect(noteCount).toBe(0);
    expect(itemCount).toBe(0);
    expect(chatIds).toEqual(["chat-other"]);
    expect(contentCount).toBe(0);
    expect(mockFns.cleanupVideoNoteArtifacts).toHaveBeenCalledWith(basename(db.name), videoNote.id);
  });
});
