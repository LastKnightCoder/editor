import { describe, expect, it, vi } from "vitest";

import EpubHardCleanupTable from "../tables/epub-hard-cleanup";

const EPUB_TABLES = ["epub_bookmarks", "epub_annotations", "epubs"];

const createDatabase = (tableNames = [...EPUB_TABLES, "project_item", "operation"]) => {
  const tables = new Set(tableNames);
  const projectItemDeletes: string[] = [];
  const deletedOperationTypes: string[] = [];
  const exec = vi.fn((sql: string) => {
    const matched = sql.match(/DROP TABLE IF EXISTS ([a-z_]+)/);
    if (matched) {
      tables.delete(matched[1]);
    }
  });
  const prepare = vi.fn((sql: string) => ({
    get: (tableName: string) =>
      sql.includes("sqlite_master") && tables.has(tableName) ? { name: tableName } : undefined,
    run: (...args: string[]) => {
      if (sql.includes("DELETE FROM project_item")) {
        projectItemDeletes.push(sql);
      }
      if (sql.includes("DELETE FROM operation")) {
        deletedOperationTypes.push(...args);
      }
    },
  }));

  return {
    tables,
    projectItemDeletes,
    deletedOperationTypes,
    exec,
    prepare,
    transaction: <T>(callback: () => T) => callback,
  };
};

describe("EpubHardCleanupTable", () => {
  it("删除三张 EPUB 表并清理项目条目引用与操作记录", () => {
    const db = createDatabase();

    EpubHardCleanupTable.upgradeTable(db as never);

    expect(db.projectItemDeletes).toHaveLength(1);
    expect(db.projectItemDeletes[0]).toContain("ref_type = 'epub'");
    expect(db.deletedOperationTypes).toEqual(["epub", "epub-annotation", "epub-bookmark"]);
    EPUB_TABLES.forEach(tableName => {
      expect(db.tables.has(tableName)).toBe(false);
    });
    expect(db.tables.has("project_item")).toBe(true);
    expect(db.tables.has("operation")).toBe(true);
  });

  it("EPUB 表已删除后仍兜底清理 project_item 与 operation，但不再实际 DROP", () => {
    const db = createDatabase(["project_item", "operation"]);

    EpubHardCleanupTable.upgradeTable(db as never);

    expect(db.projectItemDeletes).toHaveLength(1);
    expect(db.deletedOperationTypes).toEqual(["epub", "epub-annotation", "epub-bookmark"]);
    db.exec.mock.calls.forEach(([sql]) => {
      expect(sql).toMatch(/^DROP TABLE IF EXISTS/);
    });
    expect(db.tables.has("project_item")).toBe(true);
    expect(db.tables.has("operation")).toBe(true);
  });

  it("project_item 与 operation 表不存在时幂等执行且不抛错", () => {
    const db = createDatabase([]);

    expect(() => EpubHardCleanupTable.upgradeTable(db as never)).not.toThrow();
    db.prepare.mock.calls.forEach(([sql]) => {
      expect(sql).not.toContain("DELETE FROM");
    });
    db.exec.mock.calls.forEach(([sql]) => {
      expect(sql).toMatch(/^DROP TABLE IF EXISTS/);
    });
  });
});
