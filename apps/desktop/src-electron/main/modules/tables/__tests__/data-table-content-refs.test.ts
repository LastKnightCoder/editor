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
const TEXT_COLUMN = { id: "text", title: "名称", type: "text" };

/** 富文本单元格值：数组每项一个 contentId 引用 */
const cell = (contentId: number) => [{ contentId, title: `t${contentId}` }];

describe("数据表正文引用差集同步（D-129）", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(schema);
  });
  afterEach(() => db.close());

  const refCount = (id: number) =>
    (db.prepare("SELECT ref_count FROM contents WHERE id = ?").get(id) as { ref_count: number })
      .ref_count;
  const pendingAt = (id: number) =>
    db.prepare("SELECT released_at FROM content_pending_releases WHERE content_id = ?").get(id) as
      { released_at: number } | undefined;
  const contentExists = (id: number) =>
    Boolean(db.prepare("SELECT 1 FROM contents WHERE id = ?").get(id));
  /** 待回收正文基线：ref 0 + 已登记，进入数据表即由差集 retain 救回 */
  const pendingContent = () => ContentTable.createPendingContent(db, { content: [] });

  it("create 持有初始 rows 的全部引用：各 contentId 计出现次数，同 id 两次 +2", () => {
    const c11 = pendingContent();
    const c12 = pendingContent();
    const table = DataTableTable.create(db, {
      columns: [RICH_TEXT_COLUMN],
      rows: [
        { id: "r1", rt: [cell(c11)[0], ...cell(c11)], detailContentId: c12 },
        { id: "r2", text: "无引用" },
      ],
    });
    expect(table.refCount).toBe(1);
    expect(refCount(c11)).toBe(2);
    expect(refCount(c12)).toBe(1);
    expect(pendingAt(c11)).toBeUndefined();
    expect(pendingAt(c12)).toBeUndefined();
  });

  it("create 引用已不存在的正文时不抛错", () => {
    const table = DataTableTable.create(db, {
      columns: [RICH_TEXT_COLUMN],
      rows: [{ id: "r1", rt: cell(999999) }],
    });
    expect(table.id).toBeGreaterThan(0);
  });

  it("applyChanges 删除富文本列进入待回收，撤销重加即恢复，超宽限期回收也不删", () => {
    const contentId = pendingContent();
    const table = DataTableTable.create(db, {
      columns: [RICH_TEXT_COLUMN],
      rows: [{ id: "r1", rt: cell(contentId) }],
    });
    expect(refCount(contentId)).toBe(1);

    const removed = DataTableTable.applyChanges(db, {
      id: table.id,
      columns: [TEXT_COLUMN],
      rows: { upsert: [], remove: [] },
    })!;
    expect(removed.rows[0].rt).toBeUndefined();
    expect(refCount(contentId)).toBe(0);
    expect(pendingAt(contentId)).toBeTruthy();
    expect(contentExists(contentId)).toBe(true);

    // 模拟撤销：同列同值加回
    const restored = DataTableTable.applyChanges(db, {
      id: table.id,
      columns: [RICH_TEXT_COLUMN],
      rows: { upsert: [{ id: "r1", rt: cell(contentId) }], remove: [] },
    })!;
    expect(restored.rows[0].rt).toEqual(cell(contentId));
    expect(refCount(contentId)).toBe(1);
    expect(pendingAt(contentId)).toBeUndefined();

    const purged = ContentTable.collectPendingReleases(db, {
      now: 10 ** 13,
      graceMs: CONTENT_RELEASE_GRACE_MS,
    });
    expect(purged).toBe(0);
    expect(contentExists(contentId)).toBe(true);
  });

  it("applyChanges 删除行：富文本与 detailContentId 都延迟回收，超宽限期后删除", () => {
    const cellContentId = pendingContent();
    const detailContentId = pendingContent();
    const table = DataTableTable.create(db, {
      columns: [RICH_TEXT_COLUMN],
      rows: [{ id: "r1", rt: cell(cellContentId), detailContentId }],
    });

    DataTableTable.applyChanges(db, {
      id: table.id,
      rows: { upsert: [], remove: ["r1"] },
    });
    expect(refCount(cellContentId)).toBe(0);
    expect(refCount(detailContentId)).toBe(0);
    expect(pendingAt(cellContentId)).toBeTruthy();
    expect(pendingAt(detailContentId)).toBeTruthy();
    expect(contentExists(cellContentId)).toBe(true);
    expect(contentExists(detailContentId)).toBe(true);

    const purged = ContentTable.collectPendingReleases(db, {
      now: 10 ** 13,
      graceMs: CONTENT_RELEASE_GRACE_MS,
    });
    expect(purged).toBe(2);
    expect(contentExists(cellContentId)).toBe(false);
    expect(contentExists(detailContentId)).toBe(false);
  });

  it("patchRow 修改 detailContentId：0 → 新 id 时 retain，id → 0 时 release", () => {
    const contentId = pendingContent();
    const table = DataTableTable.create(db, {
      columns: [TEXT_COLUMN],
      rows: [{ id: "r1", text: "行", detailContentId: 0 }],
    });

    expect(
      DataTableTable.patchRow(db, {
        tableId: table.id,
        rowId: "r1",
        patch: { detailContentId: contentId },
        expected: { detailContentId: 0 },
      })
    ).toBe(true);
    expect(refCount(contentId)).toBe(1);
    expect(pendingAt(contentId)).toBeUndefined();

    expect(
      DataTableTable.patchRow(db, {
        tableId: table.id,
        rowId: "r1",
        patch: { detailContentId: 0 },
        expected: { detailContentId: contentId },
      })
    ).toBe(true);
    expect(refCount(contentId)).toBe(0);
    expect(pendingAt(contentId)).toBeTruthy();
    expect(contentExists(contentId)).toBe(true);
  });

  it("remove 在 2 → 1 时不释放正文；1 → 0 时全部待回收；incrementRefCount 复活后全部恢复", () => {
    const cellContentId = pendingContent();
    const detailContentId = pendingContent();
    const table = DataTableTable.create(db, {
      columns: [RICH_TEXT_COLUMN],
      rows: [{ id: "r1", rt: cell(cellContentId), detailContentId }],
    });

    DataTableTable.incrementRefCount(db, table.id);
    DataTableTable.remove(db, table.id);
    expect(refCount(cellContentId)).toBe(1);
    expect(refCount(detailContentId)).toBe(1);
    expect(pendingAt(cellContentId)).toBeUndefined();

    DataTableTable.remove(db, table.id);
    expect(refCount(cellContentId)).toBe(0);
    expect(refCount(detailContentId)).toBe(0);
    expect(pendingAt(cellContentId)).toBeTruthy();
    expect(pendingAt(detailContentId)).toBeTruthy();
    expect(contentExists(cellContentId)).toBe(true);

    DataTableTable.incrementRefCount(db, table.id);
    expect(refCount(cellContentId)).toBe(1);
    expect(refCount(detailContentId)).toBe(1);
    expect(pendingAt(cellContentId)).toBeUndefined();
    expect(pendingAt(detailContentId)).toBeUndefined();
  });

  it("已删除表上的 update / applyChanges 不改变正文引用", () => {
    const contentId = pendingContent();
    const table = DataTableTable.create(db, {
      columns: [RICH_TEXT_COLUMN],
      rows: [{ id: "r1", rt: cell(contentId) }],
    });
    DataTableTable.remove(db, table.id);
    expect(refCount(contentId)).toBe(0);

    DataTableTable.update(db, {
      id: table.id,
      columns: [RICH_TEXT_COLUMN],
      rows: [
        { id: "r1", rt: cell(contentId) },
        { id: "r2", rt: cell(contentId) },
      ],
      activeViewId: null,
    });
    expect(refCount(contentId)).toBe(0);

    DataTableTable.applyChanges(db, {
      id: table.id,
      rows: { upsert: [{ id: "r3", rt: cell(contentId) }], remove: [], inserted: ["r3"] },
    });
    expect(refCount(contentId)).toBe(0);
  });

  it("update 全量替换的差集：旧引用 release、新引用 retain", () => {
    const oldContentId = pendingContent();
    const newContentId = pendingContent();
    const table = DataTableTable.create(db, {
      columns: [RICH_TEXT_COLUMN],
      rows: [{ id: "r1", rt: cell(oldContentId) }],
    });

    DataTableTable.update(db, {
      id: table.id,
      columns: [RICH_TEXT_COLUMN],
      rows: [{ id: "r1", rt: cell(newContentId) }],
      activeViewId: null,
    });
    expect(refCount(oldContentId)).toBe(0);
    expect(pendingAt(oldContentId)).toBeTruthy();
    expect(refCount(newContentId)).toBe(1);
    expect(pendingAt(newContentId)).toBeUndefined();
  });
});
