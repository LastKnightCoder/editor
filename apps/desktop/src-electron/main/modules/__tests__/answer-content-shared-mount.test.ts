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
import DocumentTable from "../tables/document";
import ProjectTable from "../tables/project";
import { EProjectItemType, EProjectType } from "../../../../src/types/project";

function createTestDatabase() {
  const db = new Database(":memory:");
  db.exec(MAIN_SCHEMA_SQL);
  ProjectTable.upgradeTable(db);
  DocumentTable.upgradeTable(db);
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

  it("DocumentTable.upgradeTable 应为旧 document_items 补齐 ref 字段并回填来源", () => {
    const legacyDb = new Database(":memory:");
    legacyDb.exec(`
      CREATE TABLE document_items (
        id INTEGER PRIMARY KEY NOT NULL,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        title TEXT NOT NULL,
        tags TEXT,
        children TEXT,
        is_article INTEGER DEFAULT 0,
        article_id INTEGER DEFAULT 0,
        is_card INTEGER DEFAULT 0,
        card_id INTEGER DEFAULT 0,
        parents TEXT DEFAULT '[]',
        content_id INTEGER,
        documents TEXT DEFAULT '[]'
      );
    `);

    legacyDb
      .prepare(
        `INSERT INTO document_items (id, create_time, update_time, title, is_card, card_id, parents, documents)
         VALUES (1, 1, 1, '旧卡片文档', 1, 23, '[]', '[]')`,
      )
      .run();

    DocumentTable.upgradeTable(legacyDb);

    const row = legacyDb
      .prepare(`SELECT ref_type, ref_id FROM document_items WHERE id = 1`)
      .get() as { ref_type: string; ref_id: number };

    expect(row.ref_type).toBe("card");
    expect(row.ref_id).toBe(23);
    legacyDb.close();
  });

  it("项目文档共享挂载应复用原 contentId 并增加引用计数", () => {
    const project = ProjectTable.createProject(db, {
      title: "共享项目",
      desc: [],
      children: [],
      archived: false,
      pinned: false,
      projectType: EProjectType.DocumentTree,
      dataTableId: 0,
    });
    const contentId = ContentTable.createContent(db, {
      content: [
        { type: "paragraph", children: [{ text: "共享答案正文" }] },
      ] as any,
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

  it("知识库文档共享挂载应复用原 contentId 并增加引用计数", () => {
    const document = DocumentTable.createDocument(db, {
      title: "共享知识库",
      desc: "",
      children: [],
      content: [],
      isTop: false,
    });
    const contentId = ContentTable.createContent(db, {
      content: [
        { type: "paragraph", children: [{ text: "共享答案正文" }] },
      ] as any,
      count: 1,
    });

    const [, item] = DocumentTable.addRootDocumentItem(db, document.id, {
      title: "共享答案文档",
      content: [],
      children: [],
      tags: [],
      isArticle: false,
      articleId: 0,
      isCard: false,
      cardId: 0,
      refType: "content",
      refId: contentId,
      parents: [],
      count: 0,
    });

    expect(item).not.toBeNull();
    expect(item?.contentId).toBe(contentId);
    expect(item?.refType).toBe("content");
    expect(item?.refId).toBe(contentId);

    const content = ContentTable.getContentById(db, contentId);
    expect(content?.refCount).toBe(2);
  });
});
