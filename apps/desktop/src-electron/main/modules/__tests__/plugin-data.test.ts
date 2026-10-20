import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import MAIN_SCHEMA_SQL from "../../../../../../packages/db-schema/schema/main.sql?raw";
import ContentTable from "../tables/content";
import PluginDataTable from "../tables/plugin-data";

const doc = (text: string) =>
  [{ type: "paragraph", children: [{ type: "formatted", text }] }] as never;
const scope = { databaseName: ":memory:" };

describe("PluginDataTable", () => {
  let db: Database.Database;
  const content = (text: string) => ContentTable.createContent(db, { content: doc(text) });
  const card = (contentId: number, time: number, tags: string[]) =>
    Number(
      db
        .prepare(
          `INSERT INTO cards (create_time, update_time, tags, links, content_id) VALUES (?, ?, ?, '[]', ?)`
        )
        .run(time, time, JSON.stringify(tags), contentId).lastInsertRowid
    );

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(MAIN_SCHEMA_SQL);
  });
  afterEach(() => db.close());

  it("按创建时间分页，游标续读不重不漏", () => {
    const ids = [1, 2, 3].map(time => card(content(`第${time}张`), time, []));
    const first = PluginDataTable.query(db, {
      ...scope,
      entity: "card",
      query: { limit: 2, sort: "created" },
    });
    expect(first.items.map(item => item.id)).toEqual([ids[2], ids[1]]);
    expect(first.items[0].title).toBe("第3张");
    expect(first.cursor).toBeTruthy();
    const second = PluginDataTable.query(db, {
      ...scope,
      entity: "card",
      query: { limit: 2, sort: "created", cursor: first.cursor },
    });
    expect(second.items.map(item => item.id)).toEqual([ids[0]]);
    expect(second.cursor).toBeUndefined();
  });

  it("层级标签按前缀命中，时间范围含起点不含终点", () => {
    card(content("甲"), 10, ["读书/小说"]);
    card(content("乙"), 20, ["读书"]);
    card(content("丙"), 30, ["读书会"]);
    const tagged = PluginDataTable.query(db, {
      ...scope,
      entity: "card",
      query: { limit: 10, tag: "读书", sort: "created" },
    });
    expect(tagged.items.map(item => item.title)).toEqual(["乙", "甲"]);
    const ranged = PluginDataTable.query(db, {
      ...scope,
      entity: "card",
      query: { limit: 10, createdAfter: 10, createdBefore: 30, sort: "created" },
    });
    expect(ranged.items.map(item => item.title)).toEqual(["乙", "甲"]);
  });

  it("正文按身份读取并给出所属实体；创建时间不符视为不存在", async () => {
    const contentId = content("正文");
    card(contentId, 1, []);
    const createdAt = (
      db.prepare("SELECT create_time FROM contents WHERE id = ?").get(contentId) as {
        create_time: number;
      }
    ).create_time;
    const record = await PluginDataTable.content(db, {
      ...scope,
      contentId,
      createdAt,
      format: "markdown",
    });
    expect(record?.markdown?.trim()).toBe("正文");
    expect(record?.owners).toEqual(["card"]);
    expect(
      await PluginDataTable.content(db, {
        ...scope,
        contentId,
        createdAt: createdAt + 1,
        format: "nodes",
      })
    ).toBeNull();
  });

  it("拒绝跨库读取与越界参数", () => {
    expect(() =>
      PluginDataTable.query(db, { databaseName: "other", entity: "card", query: { limit: 1 } })
    ).toThrow("数据库已切换");
    expect(() =>
      PluginDataTable.query(db, { ...scope, entity: "card", query: { limit: 201 } })
    ).toThrow("limit");
    expect(() =>
      PluginDataTable.query(db, {
        ...scope,
        entity: "card",
        query: { limit: 1, cursor: "x" },
      })
    ).toThrow("游标");
  });
});
