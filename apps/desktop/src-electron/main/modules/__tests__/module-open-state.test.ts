import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp" },
  BrowserWindow: {
    getAllWindows: () => [],
  },
  ipcMain: {
    handle: vi.fn(),
  },
}));

vi.mock("../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import MAIN_SCHEMA_SQL from "../../../../../../packages/db-schema/schema/main.sql?raw";
import DatabaseItemTable from "../tables/database-item";
import VibeLearningProjectTable from "../tables/vibe-learning-project";

function createTestDatabase() {
  const db = new Database(":memory:");
  db.exec(MAIN_SCHEMA_SQL);
  return db;
}

describe("打开记录（数据库 / Notebook）", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    vi.useRealTimers();
    db.close();
  });

  it("数据库：列表带打开时间，记录不改 update_time", () => {
    const item = DatabaseItemTable.create(db, { title: "读书清单" });
    expect(DatabaseItemTable.list(db)[0].openedAt).toBeNull();

    vi.useFakeTimers({ now: item.updateTime + 60_000 });
    DatabaseItemTable.recordOpen(db, item.id);

    const [listed] = DatabaseItemTable.list(db);
    expect(listed.openedAt).toBe(item.updateTime + 60_000);
    expect(listed.updateTime).toBe(item.updateTime);
  });

  describe("Notebook", () => {
    const addResource = (projectId: number, name: string) =>
      Number(
        db
          .prepare(
            `INSERT INTO vibe_learning_resources
             (project_id, create_time, update_time, name, original_path, resource_type)
             VALUES (?, 0, 0, ?, '', 'pdf')`
          )
          .run(projectId, name).lastInsertRowid
      );
    const addNote = (projectId: number, title: string) =>
      Number(
        db
          .prepare(
            `INSERT INTO vl_note (create_time, update_time, project_id, content_id, title)
             VALUES (0, 0, ?, 0, ?)`
          )
          .run(projectId, title).lastInsertRowid
      );
    const listed = (id: number) => VibeLearningProjectTable.list(db).find(p => p.id === id);

    it("上次打开的资料或笔记作为上次看到的条目", () => {
      const notebook = VibeLearningProjectTable.create(db, { title: "Notebook" });
      const resourceId = addResource(notebook.id, "论文.pdf");
      const noteId = addNote(notebook.id, "读书笔记");

      VibeLearningProjectTable.recordOpen(db, notebook.id, { kind: "resource", id: resourceId });
      expect(listed(notebook.id)?.lastItemTitle).toBe("论文.pdf");

      VibeLearningProjectTable.recordOpen(db, notebook.id, { kind: "note", id: noteId });
      expect(listed(notebook.id)?.lastItemTitle).toBe("读书笔记");
    });

    it("不带条目时只刷新时间，保留上次看到的条目", () => {
      const notebook = VibeLearningProjectTable.create(db, { title: "Notebook" });
      const noteId = addNote(notebook.id, "读书笔记");
      VibeLearningProjectTable.recordOpen(db, notebook.id, { kind: "note", id: noteId });

      vi.useFakeTimers({ now: 5_000 });
      VibeLearningProjectTable.recordOpen(db, notebook.id, null);

      expect(listed(notebook.id)).toMatchObject({ openedAt: 5_000, lastItemTitle: "读书笔记" });
      expect(listed(notebook.id)?.updateTime).toBe(notebook.updateTime);
    });

    it("条目不属于这个 Notebook 或已删除时不显示", () => {
      const notebook = VibeLearningProjectTable.create(db, { title: "A" });
      const other = VibeLearningProjectTable.create(db, { title: "B" });
      const foreign = addResource(other.id, "别处的资料");

      VibeLearningProjectTable.recordOpen(db, notebook.id, { kind: "resource", id: foreign });
      expect(listed(notebook.id)?.lastItemTitle).toBeNull();

      VibeLearningProjectTable.recordOpen(db, notebook.id, { kind: "note", id: 9999 });
      expect(listed(notebook.id)?.lastItemTitle).toBeNull();
    });
  });
});
