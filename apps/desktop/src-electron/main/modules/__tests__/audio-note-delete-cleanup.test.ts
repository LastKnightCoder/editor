import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp/editor-test",
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
import AudioNoteTable from "../tables/audio-note";
import AudioNoteItemTable from "../tables/audio-note-item";
import AudioNoteChatTable from "../tables/audio-note-chat";

function createTestDatabase() {
  const db = new Database(":memory:");
  db.exec(MAIN_SCHEMA_SQL);
  AudioNoteItemTable.upgradeTable(db);
  AudioNoteTable.upgradeTable(db);
  AudioNoteChatTable.upgradeTable(db);
  return db;
}

describe("AudioNoteTable.deleteAudioNote", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db?.close();
  });

  it("删除音频笔记时应清理卡片内容与聊天记录", () => {
    const audioNote = AudioNoteTable.createEmptyAudioNote(db, {
      type: "local",
      filePath: "/tmp/audio.mp3",
    });

    const contentId = ContentTable.createContent(db, {
      content: [{ type: "paragraph", children: [{ text: "卡片" }] }] as any,
      count: 1,
    });
    AudioNoteItemTable.create(db, {
      audioNoteId: audioNote.id,
      contentId,
      title: "卡片",
    });
    AudioNoteChatTable.createChat(db, {
      audioNoteId: audioNote.id,
      title: "主会话",
      messages: [] as any,
    });

    const deleteChanges = AudioNoteTable.deleteAudioNote(db, audioNote.id);
    expect(deleteChanges).toBe(1);

    expect(
      (
        db
          .prepare("SELECT COUNT(*) as count FROM audio_notes WHERE id = ?")
          .get(audioNote.id) as { count: number }
      ).count,
    ).toBe(0);
    expect(
      (
        db
          .prepare(
            "SELECT COUNT(*) as count FROM audio_note_item WHERE audio_note_id = ?",
          )
          .get(audioNote.id) as { count: number }
      ).count,
    ).toBe(0);
    expect(
      (
        db
          .prepare(
            "SELECT COUNT(*) as count FROM audio_note_chats WHERE audio_note_id = ?",
          )
          .get(audioNote.id) as { count: number }
      ).count,
    ).toBe(0);
    expect(
      (
        db
          .prepare("SELECT COUNT(*) as count FROM contents WHERE id = ?")
          .get(contentId) as { count: number }
      ).count,
    ).toBe(0);
  });

  it("删除音频笔记失败时应回滚已经删除的关联内容", () => {
    const audioNote = AudioNoteTable.createEmptyAudioNote(db, {
      type: "local",
      filePath: "/tmp/audio.mp3",
    });
    const contentId = ContentTable.createContent(db, {
      content: [{ type: "paragraph", children: [{ text: "卡片" }] }] as any,
      count: 1,
    });
    AudioNoteItemTable.create(db, {
      audioNoteId: audioNote.id,
      contentId,
      title: "卡片",
    });
    vi.spyOn(AudioNoteChatTable, "deleteChatsByAudioNoteId").mockImplementation(
      () => {
        throw new Error("chat cleanup failed");
      },
    );

    expect(() => AudioNoteTable.deleteAudioNote(db, audioNote.id)).toThrow(
      "chat cleanup failed",
    );

    expect(
      (
        db
          .prepare("SELECT COUNT(*) as count FROM audio_notes WHERE id = ?")
          .get(audioNote.id) as { count: number }
      ).count,
    ).toBe(1);
    expect(
      (
        db
          .prepare(
            "SELECT COUNT(*) as count FROM audio_note_item WHERE audio_note_id = ?",
          )
          .get(audioNote.id) as { count: number }
      ).count,
    ).toBe(1);
    expect(
      (
        db
          .prepare("SELECT COUNT(*) as count FROM contents WHERE id = ?")
          .get(contentId) as { count: number }
      ).count,
    ).toBe(1);
  });
});
