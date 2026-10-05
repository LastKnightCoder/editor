import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";
import type { ExcerptInput } from "@/entity/excerpt/types";
import ExcerptTable from "../excerpt";

const input = (externalId: string, quote: string, extra: Partial<ExcerptInput> = {}) => ({
  externalId,
  quote,
  note: "",
  anchor: null,
  color: null,
  sourceTime: null,
  ...extra,
});

describe("ExcerptTable", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(schema);
  });
  afterEach(() => db.close());

  const rowsOf = (key: string) =>
    db
      .prepare(
        "SELECT external_id, quote, note, is_deleted FROM excerpt WHERE source_key = ? ORDER BY external_id"
      )
      .all(key);

  it("按来源整体同步：新增、修改、源端删除软删除；重复同步无变化", () => {
    expect(
      ExcerptTable.syncSource(db, "weread", "b1", "书", [input("b1:1", "甲"), input("b1:2", "乙")])
    ).toEqual({ inserted: 2, updated: 0, deleted: 0 });

    const next = [input("b1:1", "甲", { note: "想法" }), input("b1:3", "丙")];
    expect(ExcerptTable.syncSource(db, "weread", "b1", "书", next)).toEqual({
      inserted: 1,
      updated: 1,
      deleted: 1,
    });
    expect(ExcerptTable.syncSource(db, "weread", "b1", "书", next)).toEqual({
      inserted: 0,
      updated: 0,
      deleted: 0,
    });
    expect(rowsOf("b1")).toEqual([
      { external_id: "b1:1", quote: "甲", note: "想法", is_deleted: 0 },
      { external_id: "b1:2", quote: "乙", note: "", is_deleted: 1 },
      { external_id: "b1:3", quote: "丙", note: "", is_deleted: 0 },
    ]);
  });

  it("重新出现的摘录复位，id 不变；软删除保留引文", () => {
    ExcerptTable.syncSource(db, "web", "https://a.com/x", "A", [input("u1", "一句话")]);
    const [first] = ExcerptTable.listActive(db);
    ExcerptTable.syncSource(db, "web", "https://a.com/x", "A", []);
    expect(ExcerptTable.listActive(db)).toEqual([]);
    expect(ExcerptTable.getById(db, first.id)).toMatchObject({ quote: "一句话", isDeleted: true });

    ExcerptTable.syncSource(db, "web", "https://a.com/x", "A", [input("u1", "一句话")]);
    expect(ExcerptTable.getById(db, first.id)).toMatchObject({ isDeleted: false });
  });

  it("不同来源互不影响；同一 external_id 换了 source_key 被新来源认领", () => {
    ExcerptTable.syncSource(db, "weread", "b1", "书", [input("b1:1", "甲")]);
    ExcerptTable.syncSource(db, "web", "https://a.com/x", "A", [input("u1", "一")]);
    ExcerptTable.syncSource(db, "web", "https://a.com/y", "A", [input("u1", "一")]);
    expect(rowsOf("b1")).toHaveLength(1);
    expect(rowsOf("https://a.com/x")).toEqual([]);
    expect(rowsOf("https://a.com/y")).toEqual([
      { external_id: "u1", quote: "一", note: "", is_deleted: 0 },
    ]);
  });

  it("插件按页快照：校验后按页同步；非法参数拒绝且不写库", () => {
    const highlight = { id: "h1", text: "一句", note: "", color: "pink", createdAt: 1 };
    expect(
      ExcerptTable.syncWebPage(db, {
        url: "https://a.com/x#t",
        title: "A",
        highlights: [highlight],
      })
    ).toEqual({ inserted: 1, updated: 0, deleted: 0 });
    expect(rowsOf("https://a.com/x")).toHaveLength(1);
    expect(() =>
      ExcerptTable.syncWebPage(db, { url: "javascript:1", highlights: [highlight] })
    ).toThrow();
    expect(ExcerptTable.syncWebPage(db, { url: "https://a.com/x", highlights: [] })).toEqual({
      inserted: 0,
      updated: 0,
      deleted: 1,
    });
  });

  it("deleteSource 软删除整个来源；anchor 读出为对象", () => {
    const anchor = { chapterUid: 3, chapterIdx: 2, chapterTitle: "第二章", range: "10-20" };
    ExcerptTable.syncSource(db, "weread", "b1", "书", [input("b1:1", "甲", { anchor })]);
    expect(ExcerptTable.listActive(db)[0].anchor).toEqual(anchor);
    expect(ExcerptTable.deleteSource(db, "weread", "b1")).toBe(1);
    expect(ExcerptTable.listActive(db)).toEqual([]);
  });
});
