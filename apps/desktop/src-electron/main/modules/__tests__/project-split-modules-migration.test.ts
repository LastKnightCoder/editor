import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp" },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
}));

vi.mock("../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import MAIN_SCHEMA_SQL from "../../../../../../packages/db-schema/schema/main.sql?raw";
import ProjectTable from "../tables/project";
import DatabaseItemTable from "../tables/database-item";
import VibeLearningProjectTable from "../tables/vibe-learning-project";

/**
 * 模拟拆分前的老库：project 表带 project_type / data_table_id，
 * vibe_learning_resources 的外键仍指向 project(id)。
 */
function createLegacyDatabase() {
  const db = new Database(":memory:");
  db.exec(MAIN_SCHEMA_SQL);

  // 把 vibe_learning_resources 还原成旧外键（指向 project），模拟升级前的形态
  db.exec(`DROP TABLE vibe_learning_resources`);
  db.exec(`
    CREATE TABLE vibe_learning_resources (
      id INTEGER PRIMARY KEY,
      project_id INTEGER NOT NULL,
      sort_index INTEGER NOT NULL DEFAULT 0,
      create_time INTEGER NOT NULL,
      update_time INTEGER NOT NULL,
      name TEXT NOT NULL,
      original_path TEXT NOT NULL,
      markdown_path TEXT,
      resource_type TEXT NOT NULL,
      file_size INTEGER,
      duration INTEGER, source_type TEXT, source_meta_info TEXT, transcript_segments TEXT,
      FOREIGN KEY(project_id) REFERENCES project(id)
    )
  `);
  return db;
}

function insertLegacyProject(
  db: Database.Database,
  id: number,
  title: string,
  projectType: string,
  dataTableId = 0
) {
  db.prepare(
    `INSERT INTO project
       (id, create_time, update_time, title, desc, children, archived, pinned, project_type, data_table_id)
     VALUES (?, ?, ?, ?, '[]', '[]', 0, 1, ?, ?)`
  ).run(id, 1000, 2000, title, projectType, dataTableId);
}

describe("project:split-modules 迁移", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createLegacyDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("把 data-table / vibe-learning 项目搬到独立表，id 原样保留，project 只剩文档树", () => {
    insertLegacyProject(db, 10, "文档树", "document-tree");
    insertLegacyProject(db, 11, "表格", "data-table", 77);
    insertLegacyProject(db, 12, "学习", "vibe-learning");
    db.prepare(
      `INSERT INTO vibe_learning_resources
         (id, project_id, create_time, update_time, name, original_path, resource_type)
       VALUES (1, 12, 1, 1, '资料', '/a.pdf', 'pdf')`
    ).run();

    ProjectTable.migrateSplitModules(db);

    const projects = db.prepare(`SELECT id FROM project ORDER BY id`).all();
    expect(projects).toEqual([{ id: 10 }]);

    const dbItem = DatabaseItemTable.getById(db, 11);
    expect(dbItem).toMatchObject({ id: 11, title: "表格", dataTableId: 77, pinned: true });

    const vlProject = VibeLearningProjectTable.getById(db, 12);
    expect(vlProject).toMatchObject({ id: 12, title: "学习", pinned: true });

    // 资源仍挂在同一个 id 上，外键已改指 vibe_learning_project
    expect(db.prepare(`SELECT project_id FROM vibe_learning_resources WHERE id = 1`).get()).toEqual(
      { project_id: 12 }
    );
    const vlrSql = db
      .prepare(`SELECT sql FROM sqlite_master WHERE name = 'vibe_learning_resources'`)
      .get() as { sql: string };
    expect(vlrSql.sql).toContain("REFERENCES vibe_learning_project(id)");

    db.pragma("foreign_keys = ON");
    expect(db.prepare(`PRAGMA foreign_key_check`).all()).toEqual([]);
  });

  it("id 序列跨三张表共用，迁移后新建不会复用已迁走的 id", () => {
    insertLegacyProject(db, 30, "表格", "data-table", 5);
    insertLegacyProject(db, 31, "学习", "vibe-learning");

    ProjectTable.migrateSplitModules(db);

    const project = ProjectTable.createProject(db, {
      title: "新项目",
      desc: [],
      children: [],
      archived: false,
      pinned: false,
    });
    expect(project.id).toBeGreaterThan(31);

    const vl = VibeLearningProjectTable.create(db, { title: "新学习", desc: [] });
    expect(vl.id).toBeGreaterThan(project.id);
  });

  it("幂等：重复执行不再改动数据", () => {
    insertLegacyProject(db, 40, "表格", "data-table", 9);
    ProjectTable.migrateSplitModules(db);

    // 二次执行前手动塞一条同 id 的文档树项目，若迁移再跑会被误删
    insertLegacyProject(db, 41, "文档树", "document-tree");
    ProjectTable.migrateSplitModules(db);

    expect(db.prepare(`SELECT COUNT(*) as c FROM database_item`).get()).toEqual({ c: 1 });
    expect(db.prepare(`SELECT COUNT(*) as c FROM project`).get()).toEqual({ c: 1 });
  });
});
