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
import { EProjectItemType } from "@/types/project";
import ProjectTable from "../tables/project";

function createTestDatabase() {
  const db = new Database(":memory:");
  db.exec(MAIN_SCHEMA_SQL);
  return db;
}

function addDocument(db: Database.Database, projectId: number, title: string) {
  const [, item] = ProjectTable.addRootProjectItem(db, projectId, {
    title,
    content: [],
    count: 0,
    children: [],
    refType: "",
    refId: 0,
    whiteBoardContentId: 0,
    projectItemType: EProjectItemType.Document,
  });
  if (!item) throw new Error(`未能创建文档「${title}」`);
  return item;
}

describe("ProjectTable 打开记录", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    vi.useRealTimers();
    db.close();
  });

  const createProject = (title: string) =>
    ProjectTable.createProject(db, {
      title,
      desc: [],
      children: [],
      archived: false,
      pinned: false,
    });

  it("只返回打开过的项目，带上次停留的文档", () => {
    const opened = createProject("打开过");
    createProject("没打开过");
    const doc = addDocument(db, opened.id, "注意力机制");

    vi.useFakeTimers({ now: 1_000 });
    ProjectTable.recordOpen(db, opened.id, doc.id);

    expect(ProjectTable.getOpenStates(db)).toEqual({
      [opened.id]: { openedAt: 1_000, itemId: doc.id, itemTitle: "注意力机制" },
    });
  });

  it("不带文档进入时只刷新时间，保留上次停留的文档", () => {
    const project = createProject("项目");
    const doc = addDocument(db, project.id, "第一篇");
    ProjectTable.recordOpen(db, project.id, doc.id);

    vi.useFakeTimers({ now: 5_000 });
    ProjectTable.recordOpen(db, project.id, null);

    expect(ProjectTable.getOpenStates(db)[project.id]).toEqual({
      openedAt: 5_000,
      itemId: doc.id,
      itemTitle: "第一篇",
    });
  });

  it("不改 update_time", () => {
    const project = createProject("项目");
    const before = ProjectTable.getProject(db, project.id).updateTime;

    vi.useFakeTimers({ now: before + 60_000 });
    ProjectTable.recordOpen(db, project.id, null);

    expect(ProjectTable.getProject(db, project.id).updateTime).toBe(before);
  });

  it("文档移出项目后不再作为上次停留的文档", () => {
    const project = createProject("项目");
    const doc = addDocument(db, project.id, "会被移除");
    ProjectTable.recordOpen(db, project.id, doc.id);

    ProjectTable.removeRootProjectItem(db, project.id, doc.id);

    expect(ProjectTable.getOpenStates(db)[project.id]).toMatchObject({
      itemId: null,
      itemTitle: null,
    });
  });
});
