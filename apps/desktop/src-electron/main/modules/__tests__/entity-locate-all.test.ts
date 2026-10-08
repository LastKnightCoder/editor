import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));

// 切断 tables → database 模块的循环依赖链
vi.mock("../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import MAIN_SCHEMA_SQL from "../../../../../../packages/db-schema/schema/main.sql?raw";
import ContentTable from "../tables/content";
import EntitySearchTable from "../tables/entity-search";

const doc = (text: string) =>
  [{ type: "paragraph", children: [{ type: "formatted", text }] }] as never;

describe("EntitySearchTable.locateAll", () => {
  let db: Database.Database;
  const now = Date.now();

  const content = (text = "正文") => ContentTable.createContent(db, { content: doc(text) });
  const card = (contentId: number) =>
    Number(
      db
        .prepare(
          `INSERT INTO cards (create_time, update_time, tags, links, content_id) VALUES (?, ?, '[]', '[]', ?)`
        )
        .run(now, now, contentId).lastInsertRowid
    );
  const article = (contentId: number, isDelete = 0) =>
    Number(
      db
        .prepare(
          `INSERT INTO articles (create_time, update_time, title, author, tags, links, content_id, is_delete)
           VALUES (?, ?, '文', '', '[]', '[]', ?, ?)`
        )
        .run(now, now, contentId, isDelete).lastInsertRowid
    );
  const projectItem = (contentId: number) =>
    Number(
      db
        .prepare(
          `INSERT INTO project_item (create_time, update_time, title, content_id, children, parents, projects, project_item_type)
           VALUES (?, ?, '项', ?, '[]', '[]', '[1]', 'document')`
        )
        .run(now, now, contentId).lastInsertRowid
    );
  const diary = (contentIds: number[]) => {
    const diaryId = Number(
      db
        .prepare(
          `INSERT INTO diary_entries (create_time, update_time, type, date, content_id) VALUES (?, ?, 'daily', '2026-09-18', NULL)`
        )
        .run(now, now).lastInsertRowid
    );
    const ids = contentIds.map(contentId =>
      Number(
        db
          .prepare(
            `INSERT INTO diary_segments (create_time, update_time, diary_id, content_id) VALUES (?, ?, ?, ?)`
          )
          .run(now, now, diaryId, contentId).lastInsertRowid
      )
    );
    return ids;
  };

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(MAIN_SCHEMA_SQL);
  });

  afterEach(() => db.close());

  it("一份正文的全部身份按 卡片 > 文章 > 项目文档 排序", () => {
    const shared = content();
    const itemId = projectItem(shared);
    const cardId = card(shared);
    const articleId = article(shared);
    expect(EntitySearchTable.locateAll(db, [shared]).get(shared)).toEqual([
      { kind: "card", id: cardId },
      { kind: "article", id: articleId },
      { kind: "project-item", id: itemId },
    ]);
  });

  it("批量反查；软删文章不计；没有身份的正文不出现在结果里", () => {
    const a = content();
    const b = content();
    const orphan = content();
    const cardId = card(a);
    article(b, 1);
    const result = EntitySearchTable.locateAll(db, [a, b, orphan, a]);
    expect(result.get(a)).toEqual([{ kind: "card", id: cardId }]);
    expect(result.has(b)).toBe(false);
    expect(result.has(orphan)).toBe(false);
  });

  it("同一天的不同正文反查到各自的碎碎念身份", () => {
    const s1 = content();
    const s2 = content();
    const [first, second] = diary([s1, s2]);
    const result = EntitySearchTable.locateAll(db, [s1, s2]);
    expect(result.get(s1)).toEqual([{ kind: "diary-moment", id: first }]);
    expect(result.get(s2)).toEqual([{ kind: "diary-moment", id: second }]);
  });

  it("超过一批的正文数也能全部反查", () => {
    const ids = Array.from({ length: 450 }, () => content());
    ids.forEach(card);
    const result = EntitySearchTable.locateAll(db, ids);
    expect(result.size).toBe(450);
  });

  it("非法 id 被忽略", () => {
    expect(EntitySearchTable.locateAll(db, [0, -1, Number.NaN]).size).toBe(0);
  });
});
