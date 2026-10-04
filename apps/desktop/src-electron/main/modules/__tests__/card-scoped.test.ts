import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CardTable from "../tables/card";

vi.mock("@/utils/markdown.ts", () => ({ getMarkdown: vi.fn() }));
vi.mock("../tables/operation", () => ({ default: { insertOperation: vi.fn() } }));
vi.mock("../tables/fts", () => ({ default: {} }));
vi.mock("../tables/vec-document", () => ({ default: {} }));
vi.mock("../tables/content", () => ({ default: {} }));
vi.mock("../tables/project", () => ({ default: {} }));

let db: Database.Database;
const scope = { databaseName: ":memory:" };
beforeEach(() => {
  db = new Database(":memory:");
  db.exec(`
    CREATE TABLE cards (id INTEGER PRIMARY KEY, create_time INTEGER, update_time INTEGER,
      tags TEXT, links TEXT, content_id INTEGER, is_top INTEGER, podcast_id INTEGER);
    CREATE TABLE contents (id INTEGER PRIMARY KEY, content TEXT, count INTEGER, update_time INTEGER);
    CREATE TABLE podcasts (id INTEGER PRIMARY KEY, name TEXT, audio_url TEXT, script TEXT,
      script_lines TEXT, duration INTEGER, speakers TEXT);
    INSERT INTO contents VALUES (10, '[]', 0, 0);
    INSERT INTO cards VALUES (1, 1, 1, '["原标签"]', '[2]', 10, 0, NULL);
  `);
});
afterEach(() => db.close());

describe("卡片数据库作用域命令", () => {
  it("置顶后保存标签不会覆盖先前修改", () => {
    CardTable.patchScopedCard(db, { ...scope, id: 1, patch: { isTop: true } });
    const saved = CardTable.patchScopedCard(db, { ...scope, id: 1, patch: { tags: ["新标签"] } });
    expect(saved).toMatchObject({
      isTop: true,
      tags: ["新标签"],
      links: [2],
      contentId: 10,
    });
    expect(CardTable.getScopedCards(db, scope)[0]).toEqual(saved);
  });
  it("更新广播保留窗口同步语义", () => {
    const ctx = { broadcastOthers: vi.fn(), broadcastAll: vi.fn() };
    CardTable.patchScopedCard(db, { ...scope, id: 1, patch: { isTop: true } }, ctx);
    expect(ctx.broadcastOthers).toHaveBeenCalledWith("card:updated", {
      databaseName: ":memory:",
      cardId: 1,
    });
  });
  it("列表轻表只带预览块与播客 id，单卡命令回全量", () => {
    const content = JSON.stringify(
      Array.from({ length: 20 }, (_, i) => ({ type: "p", children: [{ text: `第${i}段` }] }))
    );
    db.exec(`
      INSERT INTO podcasts VALUES (7, '播客', 'http://audio', '脚本', '[]', 60, '[]');
      UPDATE cards SET podcast_id = 7 WHERE id = 1;
    `);
    db.prepare("UPDATE contents SET content = ? WHERE id = 10").run(content);

    const list = CardTable.getScopedCards(db, scope);
    expect(list[0].podcast).toBeUndefined();
    expect(list[0].podcastId).toBe(7);
    // 每块约 3~4 字，凑不满 200 字目标即按预览块上限截断
    expect(list[0].content).toHaveLength(12);

    const detail = CardTable.getScopedCard(db, { ...scope, id: 1 });
    expect(detail.content).toHaveLength(20);
    expect(detail.podcast?.id).toBe(7);
  });
  it("单卡命令校验库身份并拒绝不存在的卡片", () => {
    expect(() => CardTable.getScopedCard(db, { databaseName: "another", id: 1 })).toThrow(
      "数据库已切换"
    );
    expect(() => CardTable.getScopedCard(db, { ...scope, id: 99 })).toThrow("卡片不存在");
  });
  it("读、写、删除和创建均拒绝错误数据库身份", () => {
    const wrong = { databaseName: "another" };
    expect(() => CardTable.getScopedCards(db, wrong)).toThrow("数据库已切换");
    expect(() =>
      CardTable.patchScopedCard(db, { ...wrong, id: 1, patch: { isTop: true } })
    ).toThrow("数据库已切换");
    expect(() => CardTable.removeScopedCard(db, { ...wrong, id: 1 })).toThrow("数据库已切换");
    expect(() => CardTable.createScopedCard(db, { ...wrong, card: {} as never })).toThrow(
      "数据库已切换"
    );
    expect(CardTable.getCardById(db, 1)?.isTop).toBe(false);
  });
  it("拒绝修改已删除的卡片", () => {
    expect(() => CardTable.patchScopedCard(db, { ...scope, id: 99, patch: { tags: [] } })).toThrow(
      "卡片不存在"
    );
  });
});
