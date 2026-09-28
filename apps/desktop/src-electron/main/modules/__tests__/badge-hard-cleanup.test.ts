import { beforeEach, describe, expect, it, vi } from "vitest";

const contentTableMock = vi.hoisted(() => ({
  deleteContent: vi.fn(),
}));

vi.mock("../tables/content", () => ({
  default: contentTableMock,
}));

import BadgeHardCleanupTable from "../tables/badge-hard-cleanup";

const BADGE_TABLES = [
  "badge_definition",
  "badge_milestone",
  "badge_event",
  "badge_manual_entry",
  "badge_progress",
  "badge_award",
];

const createDatabase = (tableNames = [...BADGE_TABLES, "operation"]) => {
  const tables = new Set(tableNames);
  const deletedContentOperationIds: number[] = [];
  const exec = vi.fn((sql: string) => {
    const matched = sql.match(/DROP TABLE IF EXISTS ([a-z_]+)/);
    if (matched) {
      tables.delete(matched[1]);
    }
  });
  const prepare = vi.fn((sql: string) => ({
    get: (tableName: string) =>
      sql.includes("sqlite_master") && tables.has(tableName) ? { name: tableName } : undefined,
    all: () =>
      sql.includes("SELECT detail_content_id")
        ? [{ detail_content_id: 1 }, { detail_content_id: 2 }]
        : [],
    run: (...contentIds: number[]) => {
      if (sql.includes("DELETE FROM operation")) {
        deletedContentOperationIds.push(...contentIds);
      }
    },
  }));

  return {
    tables,
    deletedContentOperationIds,
    exec,
    prepare,
    transaction: <T>(callback: () => T) => callback,
  };
};

beforeEach(() => {
  contentTableMock.deleteContent.mockReset();
});

describe("BadgeHardCleanupTable", () => {
  it("删除勋章表和专属打卡内容的操作记录，同时保留共享内容", () => {
    const db = createDatabase();
    contentTableMock.deleteContent.mockImplementation((_db: unknown, contentId: number) =>
      contentId === 1 ? 1 : 0
    );

    BadgeHardCleanupTable.upgradeTable(db as never);

    expect(contentTableMock.deleteContent).toHaveBeenNthCalledWith(1, db, 1);
    expect(contentTableMock.deleteContent).toHaveBeenNthCalledWith(2, db, 2);
    expect(db.deletedContentOperationIds).toEqual([1]);
    BADGE_TABLES.forEach(tableName => {
      expect(db.tables.has(tableName)).toBe(false);
    });
  });

  it("先删勋章表再释放正文：表还在时删正文会被 detail_content_id 外键拦下", () => {
    const db = createDatabase();
    contentTableMock.deleteContent.mockImplementation(() => {
      // 真实库开着外键：勋章表还在就删正文会报 FOREIGN KEY constraint failed
      if (db.tables.has("badge_manual_entry")) throw new Error("FOREIGN KEY constraint failed");
      return 1;
    });

    BadgeHardCleanupTable.upgradeTable(db as never);

    expect(contentTableMock.deleteContent).toHaveBeenCalledTimes(2);
    expect(db.deletedContentOperationIds).toEqual([1, 2]);
    BADGE_TABLES.forEach(tableName => expect(db.tables.has(tableName)).toBe(false));
  });

  it("在勋章表已清理后重复执行不会修改数据库", () => {
    const db = createDatabase(["operation"]);

    BadgeHardCleanupTable.upgradeTable(db as never);

    expect(contentTableMock.deleteContent).not.toHaveBeenCalled();
    expect(db.exec).not.toHaveBeenCalled();
    expect(db.deletedContentOperationIds).toEqual([]);
  });
});
