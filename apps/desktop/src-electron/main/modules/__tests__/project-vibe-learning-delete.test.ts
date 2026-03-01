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

import MAIN_SCHEMA_SQL from "../../../../../../packages/db-schema/schema/main.sql?raw";
import { EProjectType } from "@/types/project";
import ContentTable from "../tables/content";
import ProjectTable from "../tables/project";
import VibeLearningChatTable from "../tables/vibe-learning-chat";
import VibeLearningResourceTable from "../tables/vibe-learning-resource";
import VLNoteTable from "../tables/vl-note";
import VLQuizTable from "../tables/vl-quiz";

function createTestDatabase() {
  const db = new Database(":memory:");
  db.exec(MAIN_SCHEMA_SQL);
  ProjectTable.upgradeTable(db);
  VibeLearningResourceTable.upgradeTable(db);
  VibeLearningChatTable.upgradeTable(db);
  VLNoteTable.upgradeTable(db);
  VLQuizTable.upgradeTable(db);
  return db;
}

function countByProjectId(
  db: Database.Database,
  tableName: string,
  projectId: number,
): number {
  const row = db
    .prepare(`SELECT COUNT(*) as count FROM ${tableName} WHERE project_id = ?`)
    .get(projectId) as { count: number };
  return row.count;
}

describe("ProjectTable.deleteProject(VibeLearning)", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("删除 VibeLearning 项目时应清理资源/聊天/笔记/测验及笔记内容", () => {
    const project = ProjectTable.createProject(db, {
      title: "VL 项目 A",
      desc: [],
      children: [],
      archived: false,
      pinned: false,
      projectType: EProjectType.VibeLearning,
      dataTableId: 0,
    });

    const noteContentId = ContentTable.createContent(db, {
      content: [
        {
          type: "paragraph",
          children: [{ text: "测试笔记" }],
        },
      ] as any,
      count: 1,
    });
    VLNoteTable.create(db, {
      projectId: project.id,
      contentId: noteContentId,
      title: "测试笔记",
      type: "note",
    });

    const quizSet = VLQuizTable.createQuizSet(db, {
      projectId: project.id,
      name: "测试测验",
      description: "desc",
      resourceIds: [],
    });
    const quizItem = VLQuizTable.createQuizItem(db, {
      quizSetId: quizSet.id,
      type: "single-choice",
      prompt: [
        {
          type: "paragraph",
          children: [{ text: "问题1" }],
        },
      ],
      detail: [],
      data: { options: ["A", "B"], answer: "A" },
      tags: [],
      difficulty: "standard",
      sortOrder: 0,
    });
    VLQuizTable.createQuizRecord(db, {
      quizSetId: quizSet.id,
      projectId: project.id,
      score: 100,
      correctCount: 1,
      totalCount: 1,
      answers: [
        {
          itemId: quizItem.id,
          userAnswer: "A",
          isCorrect: true,
          score: 100,
          duration: 1200,
        },
      ],
      duration: 1200,
    });

    VibeLearningResourceTable.createResource(db, {
      projectId: project.id,
      name: "res.pdf",
      originalPath: "/tmp/res.pdf",
      resourceType: "pdf",
    });
    VibeLearningChatTable.createChat(db, {
      projectId: project.id,
      title: "测试对话",
      messages: [] as any,
    });

    expect(countByProjectId(db, "vibe_learning_resources", project.id)).toBe(1);
    expect(countByProjectId(db, "vibe_learning_chats", project.id)).toBe(1);
    expect(countByProjectId(db, "vl_note", project.id)).toBe(1);
    expect(countByProjectId(db, "vl_quiz_set", project.id)).toBe(1);
    expect(countByProjectId(db, "vl_quiz_record", project.id)).toBe(1);

    const deleteChanges = ProjectTable.deleteProject(db, project.id);

    expect(deleteChanges).toBe(1);
    expect(
      db
        .prepare("SELECT COUNT(*) as count FROM project WHERE id = ?")
        .get(project.id) as { count: number },
    ).toEqual({ count: 0 });
    expect(countByProjectId(db, "vibe_learning_resources", project.id)).toBe(0);
    expect(countByProjectId(db, "vibe_learning_chats", project.id)).toBe(0);
    expect(countByProjectId(db, "vl_note", project.id)).toBe(0);
    expect(countByProjectId(db, "vl_quiz_set", project.id)).toBe(0);
    expect(countByProjectId(db, "vl_quiz_record", project.id)).toBe(0);
    expect(
      db
        .prepare(
          "SELECT COUNT(*) as count FROM vl_quiz_item WHERE quiz_set_id = ?",
        )
        .get(quizSet.id) as { count: number },
    ).toEqual({ count: 0 });
    expect(
      db
        .prepare("SELECT COUNT(*) as count FROM contents WHERE id = ?")
        .get(noteContentId) as { count: number },
    ).toEqual({ count: 0 });
  });

  it("删除后新建项目应使用新 ID，且不会读取到旧项目残留", () => {
    const projectA = ProjectTable.createProject(db, {
      title: "VL 项目 A",
      desc: [],
      children: [],
      archived: false,
      pinned: false,
      projectType: EProjectType.VibeLearning,
      dataTableId: 0,
    });

    const contentId = ContentTable.createContent(db, {
      content: [],
      count: 0,
    });
    VLNoteTable.create(db, {
      projectId: projectA.id,
      contentId,
      title: "旧笔记",
      type: "note",
    });
    VLQuizTable.createQuizSet(db, {
      projectId: projectA.id,
      name: "旧测验",
    });
    VibeLearningResourceTable.createResource(db, {
      projectId: projectA.id,
      name: "old.txt",
      originalPath: "/tmp/old.txt",
      resourceType: "txt",
    });

    ProjectTable.deleteProject(db, projectA.id);

    const projectB = ProjectTable.createProject(db, {
      title: "VL 项目 B",
      desc: [],
      children: [],
      archived: false,
      pinned: false,
      projectType: EProjectType.VibeLearning,
      dataTableId: 0,
    });

    expect(projectB.id).toBeGreaterThan(projectA.id);
    expect(projectB.id).not.toBe(projectA.id);
    expect(VLNoteTable.listByProjectId(db, projectB.id)).toHaveLength(0);
    expect(VLQuizTable.listQuizSets(db, projectB.id)).toHaveLength(0);
    expect(
      VibeLearningResourceTable.getResourcesByProjectId(db, projectB.id),
    ).toHaveLength(0);
  });
});
