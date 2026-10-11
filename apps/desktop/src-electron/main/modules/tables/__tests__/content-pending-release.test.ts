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
import ContentAiMetaTable from "../content-ai-meta";

const META = {
  title: "标题",
  summary: "要点",
  concepts: [],
  claims: [],
};

describe("content_pending_releases 延迟回收", () => {
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

  it("createPendingContent 以 ref_count 0 创建正文并登记待回收", () => {
    const id = ContentTable.createPendingContent(db, { content: [] });
    expect(refCount(id)).toBe(0);
    expect(pendingAt(id)).toBeTruthy();
    expect(ContentTable.getContentById(db, id)).not.toBeNull();
  });

  it("retain 重新引用并撤销登记，releaseDeferred 归零后重新登记且正文仍在", () => {
    const id = ContentTable.createPendingContent(db, { content: [] });
    ContentTable.retain(db, id);
    expect(refCount(id)).toBe(1);
    expect(pendingAt(id)).toBeUndefined();

    ContentTable.releaseDeferred(db, id);
    expect(refCount(id)).toBe(0);
    expect(pendingAt(id)).toBeTruthy();
    expect(ContentTable.getContentById(db, id)).not.toBeNull();
  });

  it("releaseDeferred 不把引用减到 0 以下，已有登记时保留更早的 released_at", () => {
    const id = ContentTable.createContent(db, { content: [] });
    ContentTable.incrementRefCount(db, id);
    expect(refCount(id)).toBe(2);

    ContentTable.releaseDeferred(db, id);
    expect(refCount(id)).toBe(1);
    expect(pendingAt(id)).toBeUndefined();

    ContentTable.releaseDeferred(db, id);
    ContentTable.releaseDeferred(db, id);
    expect(refCount(id)).toBe(0);

    const first = pendingAt(id)!.released_at;
    ContentTable.releaseDeferred(db, id);
    expect(refCount(id)).toBe(0);
    expect(pendingAt(id)!.released_at).toBe(first);
  });

  it("collectPendingReleases 删除超宽限期且为 0 的正文，级联同 deleteContent", () => {
    const id = ContentTable.createPendingContent(db, { content: [] });
    ContentAiMetaTable.upsert(db, { contentId: id, textDigest: "d", meta: META, model: "p/m" });

    const releasedAt = 1000;
    db.prepare("UPDATE content_pending_releases SET released_at = ? WHERE content_id = ?").run(
      releasedAt,
      id
    );

    const purged = ContentTable.collectPendingReleases(db, {
      now: releasedAt + CONTENT_RELEASE_GRACE_MS - 1,
      graceMs: CONTENT_RELEASE_GRACE_MS,
    });
    expect(purged).toBe(0);
    expect(ContentTable.getContentById(db, id)).not.toBeNull();

    const purgedNow = ContentTable.collectPendingReleases(db, {
      now: releasedAt + CONTENT_RELEASE_GRACE_MS,
      graceMs: CONTENT_RELEASE_GRACE_MS,
    });
    expect(purgedNow).toBe(1);
    expect(ContentTable.getContentById(db, id)).toBeNull();
    expect(ContentAiMetaTable.get(db, id)).toBeNull();
    expect(pendingAt(id)).toBeUndefined();
  });

  it("collectPendingReleases 对超期但 ref_count > 0 的只删登记", () => {
    const id = ContentTable.createPendingContent(db, { content: [] });
    ContentTable.retain(db, id);
    db.prepare("INSERT INTO content_pending_releases (content_id, released_at) VALUES (?, ?)").run(
      id,
      1
    );

    const purged = ContentTable.collectPendingReleases(db, {
      now: 10 ** 12,
      graceMs: CONTENT_RELEASE_GRACE_MS,
    });
    expect(purged).toBe(0);
    expect(refCount(id)).toBe(1);
    expect(ContentTable.getContentById(db, id)).not.toBeNull();
    expect(pendingAt(id)).toBeUndefined();
  });

  it("collectPendingReleases 对正文已不存在的登记只删登记", () => {
    db.prepare("INSERT INTO content_pending_releases (content_id, released_at) VALUES (?, ?)").run(
      999,
      1
    );

    const purged = ContentTable.collectPendingReleases(db, {
      now: 10 ** 12,
      graceMs: CONTENT_RELEASE_GRACE_MS,
    });
    expect(purged).toBe(0);
    expect(pendingAt(999)).toBeUndefined();
  });

  it("deleteContent 真删正文时清掉待回收登记", () => {
    const id = ContentTable.createContent(db, { content: [] });
    db.prepare("INSERT INTO content_pending_releases (content_id, released_at) VALUES (?, ?)").run(
      id,
      1
    );

    ContentTable.deleteContent(db, id);
    expect(ContentTable.getContentById(db, id)).toBeNull();
    expect(pendingAt(id)).toBeUndefined();
  });
});
