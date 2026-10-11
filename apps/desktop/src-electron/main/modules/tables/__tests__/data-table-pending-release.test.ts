import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";

// 内容表间接加载到 electron 与视频笔记队列
vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import ContentTable, { CONTENT_RELEASE_GRACE_MS } from "../content";
import DataTableTable from "../data-table";

const RICH_TEXT_COLUMN = { id: "rt", title: "富文本", type: "rich-text" };

/** 富文本单元格值：数组每项一个 contentId 引用 */
const cell = (contentId: number) => [{ contentId, title: `t${contentId}` }];

describe("data_table_pending_releases 物理回收（D-136 追记）", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(schema);
  });
  afterEach(() => db.close());

  const refCount = (id: number) =>
    (db.prepare("SELECT ref_count FROM contents WHERE id = ?").get(id) as { ref_count: number })
      .ref_count;
  const tableRefCount = (id: number) =>
    (
      db.prepare("SELECT ref_count FROM data_tables WHERE id = ?").get(id) as
        { ref_count: number } | undefined
    )?.ref_count;
  const tablePendingAt = (id: number) =>
    db.prepare("SELECT released_at FROM data_table_pending_releases WHERE table_id = ?").get(id) as
      { released_at: number } | undefined;
  const contentPendingAt = (id: number) =>
    db.prepare("SELECT released_at FROM content_pending_releases WHERE content_id = ?").get(id) as
      { released_at: number } | undefined;
  const contentExists = (id: number) =>
    Boolean(db.prepare("SELECT 1 FROM contents WHERE id = ?").get(id));
  const tableExists = (id: number) =>
    Boolean(db.prepare("SELECT 1 FROM data_tables WHERE id = ?").get(id));
  const viewCount = (id: number) =>
    (
      db.prepare("SELECT COUNT(*) AS count FROM data_table_views WHERE table_id = ?").get(id) as {
        count: number;
      }
    ).count;
  /** 待回收正文基线：ref 0 + 已登记，进表即由差集 retain 救回 */
  const pendingContent = () => ContentTable.createPendingContent(db, { content: [] });
  /** 建一张带富文本单元格的表并释放到 0（登记待回收），released_at 拨到期 */
  const releasedTable = () => {
    const contentId = pendingContent();
    const table = DataTableTable.create(db, {
      columns: [RICH_TEXT_COLUMN],
      rows: [{ id: "r1", rt: cell(contentId) }],
    });
    DataTableTable.remove(db, table.id);
    db.prepare("UPDATE data_table_pending_releases SET released_at = ? WHERE table_id = ?").run(
      1000,
      table.id
    );
    return { tableId: table.id, contentId };
  };
  const collect = (
    options: Partial<{ now: number; extraTableRefs: () => Map<number, number> }> = {}
  ) =>
    DataTableTable.collectPendingTables(db, {
      now: options.now ?? 1000 + CONTENT_RELEASE_GRACE_MS,
      graceMs: CONTENT_RELEASE_GRACE_MS,
      extraTableRefs: options.extraTableRefs,
    });

  it("remove 1→0 登记待回收，重复 remove 不把计数减为负", () => {
    const table = DataTableTable.create(db, { columns: [], rows: [] });
    expect(DataTableTable.remove(db, table.id)).toBe(1);
    expect(tableRefCount(table.id)).toBe(0);
    expect(tablePendingAt(table.id)).toBeTruthy();

    expect(DataTableTable.remove(db, table.id)).toBe(1);
    expect(tableRefCount(table.id)).toBe(0);

    DataTableTable.incrementRefCount(db, table.id);
    expect(tableRefCount(table.id)).toBe(1);
    expect(tablePendingAt(table.id)).toBeUndefined();
  });

  it("到期且无任何引用：删除表与视图、清除登记，正文引用不再变化", () => {
    const { tableId, contentId } = releasedTable();
    expect(refCount(contentId)).toBe(0);
    expect(viewCount(tableId)).toBeGreaterThan(0);

    expect(collect()).toBe(1);
    expect(tableExists(tableId)).toBe(false);
    expect(viewCount(tableId)).toBe(0);
    expect(tablePendingAt(tableId)).toBeUndefined();
    // 物理删除不重复释放正文（1→0 时已释放），正文由 content_pending_releases 自己回收
    expect(refCount(contentId)).toBe(0);
    expect(contentPendingAt(contentId)).toBeTruthy();
    expect(contentExists(contentId)).toBe(true);
  });

  it("未到宽限期的登记保留不动", () => {
    const { tableId } = releasedTable();
    expect(collect({ now: 1000 + CONTENT_RELEASE_GRACE_MS - 1 })).toBe(0);
    expect(tableExists(tableId)).toBe(true);
    expect(tablePendingAt(tableId)).toBeTruthy();
  });

  it("database_item 仍指向时复活：计数等于实际引用数，正文引用被重新持有", () => {
    const { tableId, contentId } = releasedTable();
    db.prepare(
      "INSERT INTO database_item (id, create_time, update_time, title, data_table_id) VALUES (1, 1, 1, '库', ?)"
    ).run(tableId);

    expect(collect()).toBe(0);
    expect(tableRefCount(tableId)).toBe(1);
    expect(tablePendingAt(tableId)).toBeUndefined();
    expect(refCount(contentId)).toBe(1);
    expect(contentPendingAt(contentId)).toBeUndefined();
  });

  it("project_item(ref_type='data-table') 仍指向时复活", () => {
    const { tableId } = releasedTable();
    db.prepare(
      "INSERT INTO project_item (id, create_time, update_time, title, ref_type, ref_id) VALUES (1, 1, 1, '条目', 'data-table', ?)"
    ).run(tableId);

    expect(collect()).toBe(0);
    expect(tableRefCount(tableId)).toBe(1);
    expect(tablePendingAt(tableId)).toBeUndefined();
  });

  it("正文里嵌套的 database 节点仍指向时复活", () => {
    const { tableId, contentId } = releasedTable();
    ContentTable.createContent(db, {
      content: [
        {
          type: "bulleted-list",
          children: [{ type: "list-item", children: [{ type: "database", tableId }] }],
        } as never,
      ],
    });

    expect(collect()).toBe(0);
    expect(tableRefCount(tableId)).toBe(1);
    expect(refCount(contentId)).toBe(1);
    expect(contentPendingAt(contentId)).toBeUndefined();
  });

  it("extraTableRefs（协作私有块）仍指向时复活，多重引用按出现次数累加", () => {
    const { tableId, contentId } = releasedTable();
    const extra = new Map([[tableId, 2]]);

    expect(collect({ extraTableRefs: () => extra })).toBe(0);
    expect(tableRefCount(tableId)).toBe(2);
    expect(refCount(contentId)).toBe(1);
    expect(contentPendingAt(contentId)).toBeUndefined();
  });

  it("存量：ref_count 为负且未登记的表首次只登记并归 0，到期后才回收", () => {
    const table = DataTableTable.create(db, { columns: [], rows: [] });
    db.prepare("UPDATE data_tables SET ref_count = -2 WHERE id = ?").run(table.id);

    const first = DataTableTable.collectPendingTables(db, {
      now: 5000,
      graceMs: CONTENT_RELEASE_GRACE_MS,
    });
    expect(first).toBe(0);
    expect(tableRefCount(table.id)).toBe(0);
    expect(tablePendingAt(table.id)?.released_at).toBe(5000);
    expect(tableExists(table.id)).toBe(true);

    const second = DataTableTable.collectPendingTables(db, {
      now: 5000 + CONTENT_RELEASE_GRACE_MS,
      graceMs: CONTENT_RELEASE_GRACE_MS,
    });
    expect(second).toBe(1);
    expect(tableExists(table.id)).toBe(false);
  });

  it("extraTableRefs 抛错时跳过整个表回收，不删任何表", () => {
    const { tableId } = releasedTable();
    const other = DataTableTable.create(db, { columns: [], rows: [] });
    DataTableTable.remove(db, other.id);
    db.prepare("UPDATE data_table_pending_releases SET released_at = ? WHERE table_id = ?").run(
      1000,
      other.id
    );

    expect(
      collect({
        extraTableRefs: () => {
          throw new Error("协作缓存不可用");
        },
      })
    ).toBe(0);
    expect(tableExists(tableId)).toBe(true);
    expect(tableExists(other.id)).toBe(true);
    expect(tablePendingAt(tableId)).toBeTruthy();
    expect(tablePendingAt(other.id)).toBeTruthy();
  });

  it("表复活先于正文回收：富文本正文在随后的 collectPendingReleases 中被救回", () => {
    const { tableId, contentId } = releasedTable();
    // 正文侧同样拨到期，模拟同批待回收
    db.prepare("UPDATE content_pending_releases SET released_at = ? WHERE content_id = ?").run(
      1000,
      contentId
    );
    // 另一篇无关正文到期，验证正文回收本身仍在工作
    const orphanId = ContentTable.createPendingContent(db, { content: [] });
    db.prepare("UPDATE content_pending_releases SET released_at = ? WHERE content_id = ?").run(
      1000,
      orphanId
    );
    // 复活依据：某篇正文里的 database 块仍指向该表
    ContentTable.createContent(db, {
      content: [{ type: "database", tableId }] as never,
    });

    expect(collect()).toBe(0);
    expect(tableRefCount(tableId)).toBe(1);

    const purged = ContentTable.collectPendingReleases(db, {
      now: 1000 + CONTENT_RELEASE_GRACE_MS,
      graceMs: CONTENT_RELEASE_GRACE_MS,
    });
    expect(purged).toBe(1);
    expect(contentExists(contentId)).toBe(true);
    expect(refCount(contentId)).toBe(1);
    expect(contentExists(orphanId)).toBe(false);
  });
});
