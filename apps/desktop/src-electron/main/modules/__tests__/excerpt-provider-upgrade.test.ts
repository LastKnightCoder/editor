import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";
import { upgradeExcerptProviders } from "../excerpt-provider-upgrade";

describe("摘录提供方开库升级", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(
      schema.replace(/,\s*location TEXT NOT NULL DEFAULT ''[^\n]*\n\s*url TEXT[^\n]*\n/, "\n")
    );
  });
  afterEach(() => db.close());

  const insert = (sourceType: string, key: string, externalId: string, anchor: string | null) =>
    db
      .prepare(
        `INSERT INTO excerpt (source_type, source_key, source_title, external_id, quote, anchor,
           create_time, update_time) VALUES (?, ?, '书', ?, '引文', ?, 1, 1)`
      )
      .run(sourceType, key, externalId, anchor).lastInsertRowid;

  it("补列并回填位置、外链与提供方名称；id 与修改时间不变；再次执行不改动", () => {
    expect(
      (db.prepare("PRAGMA table_info(excerpt)").all() as { name: string }[]).map(c => c.name)
    ).not.toContain("location");
    db.prepare(
      `INSERT INTO weread_notebook (book_id, title, pc_url, created_at, updated_at)
       VALUES ('b1', '书', 'https://weread.qq.com/web/reader/x', 0, 0)`
    ).run();
    const hl = insert("weread", "b1", "b1:1", JSON.stringify({ chapterTitle: "第一章" }));
    const orphan = insert("weread", "b2", "b2:1", null);
    const web = insert("web", "https://a.com/p", "u 1", null);

    expect(upgradeExcerptProviders(db)).toBe(true);
    const rows = db
      .prepare("SELECT id, location, url, update_time FROM excerpt ORDER BY id")
      .all() as { id: number; location: string; url: string | null; update_time: number }[];
    expect(rows).toEqual([
      { id: hl, location: "第一章", url: "https://weread.qq.com/web/reader/x", update_time: 1 },
      { id: orphan, location: "", url: null, update_time: 1 },
      { id: web, location: "", url: "https://a.com/p#tau-hl=u 1", update_time: 1 },
    ]);
    expect(
      db.prepare("SELECT source_type, label FROM excerpt_provider ORDER BY source_type").all()
    ).toEqual([
      { source_type: "web", label: "网页" },
      { source_type: "weread", label: "微信读书" },
    ]);
    expect(upgradeExcerptProviders(db)).toBe(false);
  });

  it("全新库只登记内置网页提供方", () => {
    const fresh = new Database(":memory:");
    fresh.exec(schema);
    expect(upgradeExcerptProviders(fresh)).toBe(true);
    expect(fresh.prepare("SELECT source_type FROM excerpt_provider").all()).toEqual([
      { source_type: "web" },
    ]);
    fresh.close();
  });
});
