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
import { EProjectItemType, EProjectType } from "@/types/project";
import ContentTable from "../tables/content";
import ProjectTable from "../tables/project";
import AudioNoteTable from "../tables/audio-note";
import AudioNoteItemTable from "../tables/audio-note-item";
import AudioNoteChatTable from "../tables/audio-note-chat";

function createTestDatabase() {
  const db = new Database(":memory:");
  db.exec(MAIN_SCHEMA_SQL);
  ProjectTable.upgradeTable(db);
  AudioNoteItemTable.upgradeTable(db);
  AudioNoteTable.upgradeTable(db);
  AudioNoteChatTable.upgradeTable(db);
  return db;
}

describe("ProjectTable.deleteProject(AudioNote)", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db?.close();
  });

  it("删除文档树项目时应联动清理音频笔记及其关联数据", () => {
    const project = ProjectTable.createProject(db, {
      title: "音频项目",
      desc: [],
      children: [],
      archived: false,
      pinned: false,
      projectType: EProjectType.DocumentTree,
      dataTableId: 0,
    });

    const audioNote = AudioNoteTable.createEmptyAudioNote(db, {
      type: "local",
      filePath: "/tmp/audio-project.mp3",
    });

    const contentId = ContentTable.createContent(db, {
      content: [
        { type: "paragraph", children: [{ text: "音频笔记正文" }] },
      ] as any,
      count: 1,
    });
    AudioNoteItemTable.create(db, {
      audioNoteId: audioNote.id,
      contentId,
      title: "默认卡片",
    });
    AudioNoteChatTable.createChat(db, {
      audioNoteId: audioNote.id,
      title: "音频对话",
      messages: [] as any,
    });

    const [, projectItem] = ProjectTable.addRootProjectItem(db, project.id, {
      title: "音频条目",
      content: [],
      count: 0,
      children: [],
      refType: "audio-note",
      refId: audioNote.id,
      whiteBoardContentId: 0,
      projectItemType: EProjectItemType.AudioNote,
    });
    expect(projectItem).not.toBeNull();

    const deleteChanges = ProjectTable.deleteProject(db, project.id);
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
});
