import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: () => [],
  },
  ipcMain: {
    handle: vi.fn(),
  },
  app: {
    getPath: () => "/tmp",
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
import ProjectTable from "../tables/project";
import { EProjectItemType } from "../../../../src/types/project";

function createTestDatabase() {
  const db = new Database(":memory:");
  db.exec(MAIN_SCHEMA_SQL);
  ProjectTable.upgradeTable(db);
  return db;
}

describe("共享 contentId 挂载", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("项目文档共享挂载应复用原 contentId 并增加引用计数", () => {
    const project = ProjectTable.createProject(db, {
      title: "共享项目",
      desc: [],
      children: [],
      archived: false,
      pinned: false,
    });
    const contentId = ContentTable.createContent(db, {
      content: [{ type: "paragraph", children: [{ text: "共享答案正文" }] }] as any,
      count: 1,
    });

    const [, item] = ProjectTable.addRootProjectItem(db, project.id, {
      title: "共享答案文档",
      content: [],
      count: 0,
      children: [],
      refType: "content",
      refId: contentId,
      whiteBoardContentId: 0,
      projectItemType: EProjectItemType.Document,
    });

    expect(item).not.toBeNull();
    expect(item?.contentId).toBe(contentId);
    expect(item?.refType).toBe("content");
    expect(item?.refId).toBe(contentId);

    const content = ContentTable.getContentById(db, contentId);
    expect(content?.refCount).toBe(2);
  });
});
