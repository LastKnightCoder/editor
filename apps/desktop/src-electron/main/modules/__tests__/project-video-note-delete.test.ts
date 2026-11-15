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
import { EProjectItemType, type CreateProjectItem } from "@/types/project";
import ContentTable from "../tables/content";
import ProjectTable from "../tables/project";
import VideoNoteTable from "../tables/video-note";
import VideoNoteItemTable from "../tables/video-note-item";
import ChatSessionTable from "../tables/chat-session";

function createTestDatabase() {
  const db = new Database(":memory:");
  db.exec(MAIN_SCHEMA_SQL);
  return db;
}

describe("ProjectTable.deleteProject", () => {
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
    });

    const videoNote = VideoNoteTable.createEmptyVideoNote(db, {
      type: "local",
      filePath: "/tmp/video-project.mp4",
    });

    const contentId = ContentTable.createContent(db, {
      content: [{ type: "paragraph", children: [{ text: "视频笔记正文" }] }] as any,
      count: 1,
    });
    VideoNoteItemTable.create(db, {
      videoNoteId: videoNote.id,
      contentId,
      title: "默认卡片",
    });
    ChatSessionTable.create(db, {
      id: "video-chat",
      scope: "video-note-chat",
      domainRef: String(videoNote.id),
      sessionFile: "video-chat.jsonl",
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
        db.prepare("SELECT COUNT(*) as count FROM video_notes WHERE id = ?").get(videoNote.id) as {
          count: number;
        }
      ).count
    ).toBe(1);
    expect(
      (
        db
          .prepare("SELECT COUNT(*) as count FROM video_note_item WHERE video_note_id = ?")
          .get(videoNote.id) as { count: number }
      ).count
    ).toBe(1);
    expect(ChatSessionTable.getById(db, "video-chat")).not.toBeNull();

    const deleteChanges = ProjectTable.deleteProject(db, project.id);
    expect(deleteChanges).toBe(1);

    expect(
      (
        db.prepare("SELECT COUNT(*) as count FROM project WHERE id = ?").get(project.id) as {
          count: number;
        }
      ).count
    ).toBe(0);
    expect(
      (
        db.prepare("SELECT COUNT(*) as count FROM project_item").get() as {
          count: number;
        }
      ).count
    ).toBe(0);
    expect(
      (
        db.prepare("SELECT COUNT(*) as count FROM video_notes WHERE id = ?").get(videoNote.id) as {
          count: number;
        }
      ).count
    ).toBe(0);
    expect(
      (
        db
          .prepare("SELECT COUNT(*) as count FROM video_note_item WHERE video_note_id = ?")
          .get(videoNote.id) as { count: number }
      ).count
    ).toBe(0);
    expect(ChatSessionTable.getById(db, "video-chat")).toBeNull();
    expect(
      (
        db.prepare("SELECT COUNT(*) as count FROM contents WHERE id = ?").get(contentId) as {
          count: number;
        }
      ).count
    ).toBe(0);
  });

  it("项目整删失败时回滚，重试只释放本项目独有条目并保留其他挂载和孤儿", () => {
    const makeProject = (title: string) =>
      ProjectTable.createProject(db, {
        title,
        desc: [],
        children: [],
        archived: false,
        pinned: false,
      });
    const input = (title: string, contentId?: number): CreateProjectItem => ({
      title,
      content: [],
      count: 0,
      children: [],
      refType: "",
      refId: 0,
      whiteBoardContentId: 0,
      projectItemType: EProjectItemType.Document,
      contentId,
    });
    const removedProject = makeProject("待删除项目");
    const otherProject = makeProject("保留项目");
    const [, parent] = ProjectTable.addRootProjectItem(db, removedProject.id, input("原父条目"));
    if (!parent) throw new Error("未创建父条目");
    const sharedInput = (title: string) => input(title, parent.contentId);
    const shared = ProjectTable.addChildProjectItem(db, parent.id, sharedInput("共用条目"))?.[1];
    const exclusive = ProjectTable.addChildProjectItem(db, parent.id, sharedInput("独有条目"))?.[1];
    if (!shared || !exclusive) throw new Error("未创建子条目");
    ProjectTable.addRefRootProjectItem(db, otherProject.id, shared.id);
    ProjectTable.addRefRootProjectItem(db, removedProject.id, exclusive.id);

    const orphanContentId = ContentTable.createContent(db, { content: [] });
    const orphanId = Number(
      db
        .prepare(
          "INSERT INTO project_item (create_time, update_time, title, content_id, projects) VALUES (1, 1, '无关孤儿', ?, '[]')"
        )
        .run(orphanContentId).lastInsertRowid
    );
    const body = (id: number) => db.prepare("SELECT ref_count FROM contents WHERE id = ?").get(id);
    expect(body(parent.contentId)).toEqual({ ref_count: 3 });
    expect(body(orphanContentId)).toEqual({ ref_count: 1 });
    const snapshot = () =>
      ["project", "project_item", "contents", "operation"].map(table =>
        db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()
      );
    const before = snapshot();
    db.exec(`CREATE TEMP TRIGGER reject_project_delete BEFORE DELETE ON project
      BEGIN SELECT RAISE(ABORT, '注入项目行删除故障'); END`);
    expect(() => ProjectTable.deleteProject(db, removedProject.id)).toThrow("注入项目行删除故障");
    expect(snapshot()).toEqual(before);
    db.exec("DROP TRIGGER reject_project_delete");

    expect(ProjectTable.deleteProject(db, removedProject.id)).toBe(1);
    expect(ProjectTable.getProjectOrNull(db, removedProject.id)).toBeNull();
    expect(ProjectTable.getProject(db, otherProject.id).children).toEqual([shared.id]);
    expect(ProjectTable.getProjectItem(db, shared.id)).toMatchObject({
      projects: [otherProject.id],
      parents: [],
      contentId: parent.contentId,
    });
    expect(ProjectTable.getProjectItem(db, parent.id)).toBeNull();
    expect(ProjectTable.getProjectItem(db, exclusive.id)).toBeNull();
    expect(body(parent.contentId)).toEqual({ ref_count: 1 });
    expect(ProjectTable.getProjectItem(db, orphanId)).not.toBeNull();
    expect(body(orphanContentId)).toEqual({ ref_count: 1 });

    expect(ProjectTable.deleteProjectItemsNotInAnyProject(db)).toBe(1);
    expect(ProjectTable.getProjectItem(db, orphanId)).toBeNull();
    expect(body(orphanContentId)).toBeUndefined();
  });
});
