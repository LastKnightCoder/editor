import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";
import type { ExcerptInput } from "@/entity/excerpt/types";
import ExcerptTable from "../excerpt";
import WebPageTable from "../web-page";

const input = (externalId: string, extra: Partial<ExcerptInput> = {}): ExcerptInput => ({
  externalId,
  quote: `原文 ${externalId}`,
  note: "",
  location: "",
  url: null,
  anchor: null,
  color: "yellow",
  sourceTime: null,
  ...extra,
});

describe("WebPageTable", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(schema);
  });
  afterEach(() => db.close());

  /** 与伴读同步同一顺序：先记页面，再用显示名写摘录 */
  const sync = (url: string, title: string, inputs: ExcerptInput[]) =>
    ExcerptTable.syncSource(db, "web", url, WebPageTable.touch(db, url, title), inputs);

  const sourceTitles = (url: string) =>
    (
      db.prepare("SELECT DISTINCT source_title FROM excerpt WHERE source_key = ?").all(url) as {
        source_title: string;
      }[]
    ).map(row => row.source_title);

  const page = (overrides = {}) => ({
    offset: 0,
    limit: 50,
    sort: "recent" as const,
    ...overrides,
  });

  it("页面汇总：条数、批注数、颜色计数、站点；标注删光且没改名的页面不列出", () => {
    sync("https://a.com/x", "A 页", [
      input("a1", { color: "yellow", note: "想法", sourceTime: 10 }),
      input("a2", { color: "blue", sourceTime: 30 }),
      input("a3", { color: "yellow", sourceTime: 20 }),
    ]);
    sync("https://b.com:8080/y", "B 页", [input("b1", { sourceTime: 5 })]);
    sync("https://c.com/z", "C 页", [input("c1")]);
    sync("https://c.com/z", "C 页", []);

    expect(WebPageTable.listPages(db, page())).toEqual({
      total: 2,
      items: [
        {
          url: "https://a.com/x",
          host: "a.com",
          title: "A 页",
          pageTitle: "A 页",
          renamed: false,
          count: 3,
          noted: 1,
          colors: { yellow: 2, blue: 1 },
          lastTime: 30,
        },
        expect.objectContaining({
          url: "https://b.com:8080/y",
          host: "b.com:8080",
          count: 1,
        }),
      ],
    });
    expect(WebPageTable.listSites(db)).toEqual([
      { host: "a.com", count: 1 },
      { host: "b.com:8080", count: 1 },
    ]);
  });

  it("排序、分页、站点与批注筛选、搜索（显示名 / 原文 / 批注，通配符按字面）", () => {
    sync("https://a.com/1", "Rust 所有权", [input("1", { sourceTime: 1 })]);
    sync("https://a.com/2", "React 19", [
      input("2a", { sourceTime: 3, note: "100% 要看" }),
      input("2b", { sourceTime: 2 }),
    ]);
    sync("https://b.com/3", "SQLite", [input("3", { sourceTime: 2, quote: "WAL 模式" })]);
    const urls = (params = {}) =>
      WebPageTable.listPages(db, page(params)).items.map(item => item.url);

    expect(urls()).toEqual(["https://a.com/2", "https://b.com/3", "https://a.com/1"]);
    expect(urls({ sort: "oldest" })).toEqual([
      "https://a.com/1",
      "https://b.com/3",
      "https://a.com/2",
    ]);
    expect(urls({ sort: "most" })[0]).toBe("https://a.com/2");
    expect(urls({ sort: "title" })).toEqual([
      "https://a.com/2",
      "https://a.com/1",
      "https://b.com/3",
    ]);
    expect(WebPageTable.listPages(db, page({ limit: 1, offset: 1 }))).toMatchObject({
      total: 3,
      items: [{ url: "https://b.com/3" }],
    });
    expect(urls({ host: "a.com" })).toEqual(["https://a.com/2", "https://a.com/1"]);
    expect(urls({ noted: true })).toEqual(["https://a.com/2"]);
    expect(urls({ url: "https://b.com/3" })).toEqual(["https://b.com/3"]);
    expect(urls({ query: "rust" })).toEqual(["https://a.com/1"]);
    expect(urls({ query: "WAL" })).toEqual(["https://b.com/3"]);
    expect(urls({ query: "100%" })).toEqual(["https://a.com/2"]);
    expect(urls({ query: "%" })).toEqual(["https://a.com/2"]);
  });

  it("改名写进摘录 source_title；之后的同步不覆盖；恢复回到最新网页标题", () => {
    sync("https://a.com/x", "React v19 – React", [input("a1")]);
    expect(WebPageTable.rename(db, "https://a.com/x", "React 19 新特性")).toMatchObject({
      title: "React 19 新特性",
      pageTitle: "React v19 – React",
      renamed: true,
    });
    expect(sourceTitles("https://a.com/x")).toEqual(["React 19 新特性"]);

    sync("https://a.com/x", "React 19 – React", [input("a1"), input("a2")]);
    expect(sourceTitles("https://a.com/x")).toEqual(["React 19 新特性"]);
    expect(WebPageTable.displayTitle(db, "https://a.com/x")).toBe("React 19 新特性");

    expect(WebPageTable.rename(db, "https://a.com/x", null)).toMatchObject({
      title: "React 19 – React",
      renamed: false,
    });
    expect(sourceTitles("https://a.com/x")).toEqual(["React 19 – React"]);
    // 只有本机笔记的页面：改名即建页面行，并列进伴读库
    expect(WebPageTable.rename(db, "https://note.com/p", "只有笔记")).toMatchObject({
      host: "note.com",
      title: "只有笔记",
      pageTitle: "",
      count: 0,
    });
    expect(
      WebPageTable.listPages(db, page({ url: "https://note.com/p" })).items.map(item => item.title)
    ).toEqual(["只有笔记"]);
  });

  it("空标题不覆盖已记下的网页标题", () => {
    sync("https://a.com/x", "有标题", [input("a1")]);
    expect(WebPageTable.touch(db, "https://a.com/x", "")).toBe("有标题");
  });

  it("全部标注：按时间倒序、颜色 / 批注 / 搜索筛选、分页", () => {
    sync("https://a.com/x", "A", [
      input("a1", { sourceTime: 1, color: "red", note: "批注" }),
      input("a2", { sourceTime: 3 }),
    ]);
    sync("https://b.com/y", "B", [input("b1", { sourceTime: 2 })]);
    const ids = (params = {}) =>
      WebPageTable.listFeed(db, { offset: 0, limit: 50, ...params }).items.map(
        item => item.externalId
      );

    expect(ids()).toEqual(["a2", "b1", "a1"]);
    expect(ids({ color: "red" })).toEqual(["a1"]);
    expect(ids({ noted: true })).toEqual(["a1"]);
    expect(ids({ query: "B" })).toEqual(["b1"]);
    expect(WebPageTable.listFeed(db, { offset: 1, limit: 1 })).toMatchObject({
      total: 3,
      items: [{ externalId: "b1", sourceTitle: "B" }],
    });
  });

  it("回填存量网页摘录的页面行；再次执行不改动", () => {
    ExcerptTable.syncSource(db, "web", "https://a.com/x", "旧标题", [input("a1")]);
    ExcerptTable.syncSource(db, "weread", "book", "书", [input("w1")]);
    sync("https://b.com/y", "B", [input("b1")]);

    expect(WebPageTable.backfill(db)).toBe(1);
    expect(WebPageTable.getPage(db, "https://a.com/x")).toMatchObject({
      host: "a.com",
      title: "旧标题",
      count: 1,
    });
    expect(WebPageTable.backfill(db)).toBe(0);
    expect(db.prepare("SELECT COUNT(*) AS n FROM web_page").get()).toEqual({
      n: 2,
    });
  });
});
