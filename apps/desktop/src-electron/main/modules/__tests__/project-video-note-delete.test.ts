import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
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
import VideoNoteTable from "../tables/video-note";
import VideoNoteItemTable from "../tables/video-note-item";
import VideoNoteChatTable from "../tables/video-note-chat";

function createTestDatabase() {
  const db = new Database(":memory:");
  db.exec(MAIN_SCHEMA_SQL);
  ProjectTable.upgradeTable(db);
  VideoNoteItemTable.upgradeTable(db);
  VideoNoteTable.upgradeTable(db);
  VideoNoteChatTable.upgradeTable(db);
  return db;
}

describe("ProjectTable.deleteProject(VideoNote)", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("删除文档树项目时应联动清理视频笔记及其关联数据", () => {
    const project = ProjectTable.createProject(db, {
      title: "视频项目",
      desc: [],
      children: [],
      archived: false,
      pinned: false,
      projectType: EProjectType.DocumentTree,
      dataTableId: 0,
    });

    const videoNote = VideoNoteTable.createEmptyVideoNote(db, {
      type: "local",
      filePath: "/tmp/video-project.mp4",
    });

    const contentId = ContentTable.createContent(db, {
      content: [
        { type: "paragraph", children: [{ text: "视频笔记正文" }] },
      ] as any,
      count: 1,
    });
    VideoNoteItemTable.create(db, {
      videoNoteId: videoNote.id,
      contentId,
      title: "默认卡片",
    });
    VideoNoteChatTable.createChat(db, {
      videoNoteId: videoNote.id,
      title: "视频对话",
      messages: [] as any,
    });

    const [, projectItem] = ProjectTable.addRootProjectItem(db, project.id, {
      title: "视频条目",
      content: [],
      count: 0,
      children: [],
      refType: "",
      refId: videoNote.id,
      whiteBoardContentId: 0,
      projectItemType: EProjectItemType.VideoNote,
    });
    expect(projectItem).not.toBeNull();

    expect(
      (
        db
          .prepare("SELECT COUNT(*) as count FROM video_notes WHERE id = ?")
          .get(videoNote.id) as { count: number }
      ).count,
    ).toBe(1);
    expect(
      (
        db
          .prepare(
            "SELECT COUNT(*) as count FROM video_note_item WHERE video_note_id = ?",
          )
          .get(videoNote.id) as { count: number }
      ).count,
    ).toBe(1);
    expect(
      (
        db
          .prepare(
            "SELECT COUNT(*) as count FROM video_note_chats WHERE video_note_id = ?",
          )
          .get(videoNote.id) as { count: number }
      ).count,
    ).toBe(1);

    const deleteChanges = ProjectTable.deleteProject(db, project.id);
    expect(deleteChanges).toBe(1);

    expect(
      (
        db
          .prepare("SELECT COUNT(*) as count FROM project WHERE id = ?")
          .get(project.id) as { count: number }
      ).count,
    ).toBe(0);
    expect(
      (
        db.prepare("SELECT COUNT(*) as count FROM project_item").get() as {
          count: number;
        }
      ).count,
    ).toBe(0);
    expect(
      (
        db
          .prepare("SELECT COUNT(*) as count FROM video_notes WHERE id = ?")
          .get(videoNote.id) as { count: number }
      ).count,
    ).toBe(0);
    expect(
      (
        db
          .prepare(
            "SELECT COUNT(*) as count FROM video_note_item WHERE video_note_id = ?",
          )
          .get(videoNote.id) as { count: number }
      ).count,
    ).toBe(0);
    expect(
      (
        db
          .prepare(
            "SELECT COUNT(*) as count FROM video_note_chats WHERE video_note_id = ?",
          )
          .get(videoNote.id) as { count: number }
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
