import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";
import type { ExcerptInput } from "@/entity/excerpt/types";
import ExcerptTable from "../excerpt";

const input = (externalId: string, quote: string, extra: Partial<ExcerptInput> = {}) => ({
  externalId,
  quote,
  note: "",
  location: "",
  url: null,
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

  describe("插件提供方", () => {
    const source = { key: "b1", title: "书", url: "https://example.com/b1" };
    const ids = () =>
      Object.fromEntries(
        (
          db.prepare("SELECT external_id, id FROM excerpt ORDER BY id").all() as {
            external_id: string;
            id: number;
          }[]
        ).map(row => [row.external_id, row.id])
      );

    it("快照覆盖与已有行合并：id 不变、条目缺省 url 取来源外链，字段顺序不同的 anchor 不算变化", () => {
      ExcerptTable.syncSource(db, "weread", "b1", "书", [
        input("b1:1", "甲", { anchor: { chapterUid: 1, range: "1-2" } }),
      ]);
      const before = ids();
      expect(
        ExcerptTable.replaceFromProvider(db, "weread", source, [
          { externalId: "b1:1", quote: "甲", anchor: { range: "1-2", chapterUid: 1 } },
          { externalId: "b1:2", quote: "乙", location: "第二章", url: "https://example.com/b1#2" },
        ])
      ).toEqual({ inserted: 1, updated: 1, deleted: 0 });
      expect(ids()["b1:1"]).toBe(before["b1:1"]);
      const [first, second] = ExcerptTable.listItemsOfProvider(db, "weread", "b1");
      expect(first.url).toBe("https://example.com/b1");
      expect(second).toMatchObject({ location: "第二章", url: "https://example.com/b1#2" });
      expect(
        ExcerptTable.replaceFromProvider(db, "weread", source, [
          { externalId: "b1:1", quote: "甲", anchor: { chapterUid: 1, range: "1-2" } },
          { externalId: "b1:2", quote: "乙", location: "第二章", url: "https://example.com/b1#2" },
        ])
      ).toEqual({ inserted: 0, updated: 0, deleted: 0 });
    });

    it("增量只改给出的条目，删除为软删除，来源改名同步其余条目", () => {
      ExcerptTable.replaceFromProvider(db, "x.reader", source, [
        { externalId: "1", quote: "甲" },
        { externalId: "2", quote: "乙" },
      ]);
      expect(
        ExcerptTable.patchFromProvider(
          db,
          "x.reader",
          { ...source, title: "新书名" },
          {
            upsert: [{ externalId: "3", quote: "丙" }],
            remove: ["1", "missing"],
          }
        )
      ).toEqual({ inserted: 1, updated: 1, deleted: 1 });
      const rows = ExcerptTable.listItemsOfProvider(db, "x.reader", "b1");
      expect(rows.map(row => [row.externalId, row.sourceTitle, row.isDeleted])).toEqual([
        ["1", "新书名", true],
        ["2", "新书名", false],
        ["3", "新书名", false],
      ]);
      expect(ExcerptTable.listSourcesOfProvider(db, "x.reader")).toEqual([
        { key: "b1", title: "新书名", count: 2 },
      ]);
    });

    it("来源类型隔离：只读写本提供方，内置名保留；非法参数整批拒绝不写库", () => {
      ExcerptTable.syncSource(db, "web", "https://a.com", "A", [input("u1", "网页")]);
      expect(ExcerptTable.listSourcesOfProvider(db, "x.reader")).toEqual([]);
      expect(() => ExcerptTable.replaceFromProvider(db, "web", source, [])).toThrow("保留名");
      expect(() => ExcerptTable.registerProvider(db, "web", "网页")).toThrow("保留名");
      expect(() =>
        ExcerptTable.replaceFromProvider(db, "x.reader", source, [
          { externalId: "1", quote: "甲" },
          { externalId: "1", quote: "重复" },
        ])
      ).toThrow("重复");
      expect(() =>
        ExcerptTable.replaceFromProvider(db, "x.reader", source, [
          { externalId: "1", quote: "甲", url: "javascript:alert(1)" },
        ])
      ).toThrow("http(s)");
      expect(() =>
        ExcerptTable.patchFromProvider(db, "x.reader", source, {
          upsert: [{ externalId: "1", quote: "甲" }],
          remove: ["1"],
        })
      ).toThrow("同时");
      expect(() => ExcerptTable.replaceFromProvider(db, "x.reader", { key: "" }, [])).toThrow();
      expect(ExcerptTable.listSourcesOfProvider(db, "x.reader")).toEqual([]);
    });

    it("登记提供方名称：插入与改名", () => {
      ExcerptTable.registerProvider(db, "x.reader", "阅读器");
      ExcerptTable.registerProvider(db, "x.reader", "阅读器");
      ExcerptTable.registerProvider(db, "x.reader", "新阅读器");
      expect(ExcerptTable.providerLabels(db).get("x.reader")).toBe("新阅读器");
      expect(() => ExcerptTable.registerProvider(db, "x.reader", " ")).toThrow("不能为空");
    });
  });
});
