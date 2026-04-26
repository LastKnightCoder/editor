import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import WhiteBoardContentTable from "../tables/white-board-content";

function createTestDatabase() {
  const db = new Database(":memory:");
  db.exec(MAIN_SCHEMA_SQL);
  WhiteBoardContentTable.upgradeTable(db);
  return db;
}

describe("WhiteBoardContentTable content ref counting", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("同一白板中新增重复 contentId 时应增加引用，删除重复项时应只释放差量", () => {
    const contentId = ContentTable.createContent(db, {
      content: [{ type: "paragraph", children: [{ text: "白板笔记" }] }] as any,
      count: 1,
    });

    const whiteboardContent = WhiteBoardContentTable.createWhiteboardContent(
      db,
      {
        name: "测试白板",
        imgUrl: "",
        data: {
          children: [
            {
              id: "richtext-1",
              type: "richtext",
              contentId,
              content: [],
            },
          ],
        } as any,
      },
    );

    WhiteBoardContentTable.updateWhiteboard(db, {
      id: whiteboardContent.id,
      name: whiteboardContent.name,
      imgUrl: whiteboardContent.imgUrl,
      data: {
        children: [
          {
            id: "richtext-1",
            type: "richtext",
            contentId,
            content: [],
          },
          {
            id: "richtext-2",
            type: "richtext",
            contentId,
            content: [],
          },
        ],
      } as any,
    });

    expect(ContentTable.getContentById(db, contentId)?.refCount).toBe(2);

    WhiteBoardContentTable.updateWhiteboard(db, {
      id: whiteboardContent.id,
      name: whiteboardContent.name,
      imgUrl: whiteboardContent.imgUrl,
      data: {
        children: [
          {
            id: "richtext-1",
            type: "richtext",
            contentId,
            content: [],
          },
        ],
      } as any,
    });

    expect(ContentTable.getContentById(db, contentId)?.refCount).toBe(1);
  });
});
